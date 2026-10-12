"""Orchestration for POST /api/v1/route-plans.

This module wires providers to the framework-independent domain:

    resolve endpoints
    -> plan exactly three routes (transient-only retry)
    -> generate checkpoints with UTC ETAs
    -> sample weather per checkpoint (transient-only retry)
    -> classify risk with load rules
    -> aggregate summaries and recommend deterministically

It imports no Django modules, so the full flow is unit-testable with
mock providers. Permanent provider errors propagate for the view to
map; exhausted transient errors propagate as-is.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from math import isfinite
from typing import TypeVar

from providers.errors import ProviderTransientError
from providers.protocols import (
    RouteGeometry,
    RoutePlanRequest,
    RoutingProvider,
    WeatherProvider,
)
from risk.engine import calculate_risk
from routing.aggregation import aggregate_routes
from routing.checkpoints import Checkpoint, Coordinate, generate_checkpoints
from routing.domain import (
    RecommendationResult,
    Route,
    RouteCheckpoint,
)
from routing.recommendation import recommend_route
from routing.segments import (
    EnrichedRouteGeometry,
    build_segments,
    enrich_geometry,
)

T = TypeVar("T")

MAX_ATTEMPTS = 3


@dataclass(frozen=True, slots=True)
class Endpoint:
    """One trip endpoint in either accepted input form.

    Attributes:
        address: Place name for provider geocoding, or None.
        coordinate: Direct WGS84 coordinates, or None.
    """

    address: str | None = None
    coordinate: Coordinate | None = None

    def __post_init__(self) -> None:
        """Require exactly one endpoint form with a non-blank address."""
        given = [
            value for value in (self.address, self.coordinate) if value is not None
        ]
        if len(given) != 1:
            raise ValueError("endpoint needs exactly one of address or coordinate")
        if self.address is not None and not self.address.strip():
            raise ValueError("endpoint address must not be blank")


@dataclass(frozen=True, slots=True)
class PlannedRoutePlan:
    """Domain result of planning, before HTTP serialization.

    Attributes:
        plan_id: Deterministic SHA-256 hex digest of the request.
        routes: The three summarized routes in provider order.
        geometries: Provider geometries aligned with routes.
        recommendation: Deterministic ranking result.
        warnings: Human-readable degradation notes.
    """

    plan_id: str
    routes: tuple[Route, Route, Route]
    geometries: tuple[RouteGeometry, RouteGeometry, RouteGeometry]
    recommendation: RecommendationResult
    warnings: tuple[str, ...]


def plan_id_for(
    origin: Endpoint,
    destination: Endpoint,
    departure_at: datetime,
    load_weight_lb: float,
    checkpoint_interval_miles: float,
) -> str:
    """Derive the deterministic plan id from normalized request inputs."""
    canonical = json.dumps(
        {
            "origin": _endpoint_key(origin),
            "destination": _endpoint_key(destination),
            "departure_at": departure_at.astimezone(UTC).isoformat(),
            "load_weight_lb": load_weight_lb,
            "checkpoint_interval_miles": checkpoint_interval_miles,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(canonical.encode("utf-8")).hexdigest()


def plan_route_plan(
    origin: Endpoint,
    destination: Endpoint,
    departure_at: datetime,
    load_weight_lb: float,
    checkpoint_interval_miles: float,
    *,
    routing_provider: RoutingProvider,
    weather_provider: WeatherProvider,
) -> PlannedRoutePlan:
    """Run the full planning flow and return the domain result."""
    _validate_inputs(load_weight_lb)
    origin_coord = _resolve_endpoint(origin, routing_provider)
    destination_coord = _resolve_endpoint(destination, routing_provider)
    geometries = _with_retry(
        routing_provider.plan_routes,
        RoutePlanRequest(
            origin=origin_coord,
            destination=destination_coord,
            departure=departure_at,
        ),
    )
    routes = tuple(
        _build_route(
            f"route-{index + 1}",
            geometry,
            departure_at,
            load_weight_lb,
            checkpoint_interval_miles,
            weather_provider,
        )
        for index, geometry in enumerate(geometries)
    )
    summarized = aggregate_routes(routes)
    # aggregate_routes preserves order; cast to the fixed three-route shape.
    three: tuple[Route, Route, Route] = (summarized[0], summarized[1], summarized[2])
    recommendation = recommend_route(three)
    warnings = _collect_warnings(three, recommendation)
    return PlannedRoutePlan(
        plan_id=plan_id_for(
            origin, destination, departure_at, load_weight_lb, checkpoint_interval_miles
        ),
        routes=three,
        geometries=geometries,
        recommendation=recommendation,
        warnings=warnings,
    )


def _with_retry(call: Callable[..., T], *args: object, **kwargs: object) -> T:
    """Retry transient provider failures up to MAX_ATTEMPTS total calls."""
    attempts = 0
    while True:
        try:
            return call(*args, **kwargs)
        except ProviderTransientError:
            attempts += 1
            if attempts >= MAX_ATTEMPTS:
                raise


def _validate_inputs(load_weight_lb: float) -> None:
    """Reject non-finite or negative load weights (caller errors)."""
    if not isfinite(load_weight_lb) or load_weight_lb < 0:
        raise ValueError(f"load_weight_lb must be finite and >= 0: {load_weight_lb!r}")


def _resolve_endpoint(
    endpoint: Endpoint, routing_provider: RoutingProvider
) -> Coordinate:
    """Return direct coordinates or geocode the address."""
    if endpoint.coordinate is not None:
        return endpoint.coordinate
    assert endpoint.address is not None  # guaranteed by Endpoint validation
    return _with_retry(routing_provider.geocode, endpoint.address)


def _endpoint_key(endpoint: Endpoint) -> str:
    """Render an endpoint into its canonical plan-id fragment."""
    if endpoint.coordinate is not None:
        return f"{endpoint.coordinate.latitude},{endpoint.coordinate.longitude}"
    assert endpoint.address is not None  # guaranteed by Endpoint validation
    return endpoint.address.strip().lower()


def _build_route(
    route_id: str,
    geometry: RouteGeometry,
    departure_at: datetime,
    load_weight_lb: float,
    checkpoint_interval_miles: float,
    weather_provider: WeatherProvider,
) -> Route:
    """Sample checkpoints, classify each, and build an unsummarized route."""
    sampled = generate_checkpoints(
        geometry.points,
        checkpoint_interval_miles,
        departure_at,
        geometry.duration_seconds,
    )
    checkpoints = tuple(
        _classify_checkpoint(point, sequence, weather_provider, load_weight_lb)
        for sequence, point in enumerate(sampled, start=1)
    )
    enriched_geometry = _build_enriched_geometry(geometry.points, checkpoints)
    return Route(
        route_id=route_id,
        distance_miles=geometry.distance_miles,
        duration_seconds=geometry.duration_seconds,
        checkpoints=checkpoints,
        enriched_geometry=enriched_geometry,
    )


def _build_enriched_geometry(
    geometry_points: tuple,
    checkpoints: tuple,
) -> EnrichedRouteGeometry | None:
    """Enrich route geometry and build risk segments.

    Returns None when segment construction fails validation; the caller
    then omits risk_segments and the frontend falls back to route-level
    coloring.
    """
    enriched_points, checkpoint_indices = enrich_geometry(
        geometry_points,
        [cp.distance_from_origin_miles for cp in checkpoints],
    )
    segments = build_segments(
        checkpoint_indices,
        [cp.risk for cp in checkpoints],
        len(enriched_points),
    )
    if segments is None:
        return None
    return EnrichedRouteGeometry(
        points=enriched_points,
        checkpoint_indices=checkpoint_indices,
        segments=segments,
    )


def _classify_checkpoint(
    point: Checkpoint,
    sequence: int,
    weather_provider: WeatherProvider,
    load_weight_lb: float,
) -> RouteCheckpoint:
    """Attach weather and risk to one sampled checkpoint.

    Missing weather stays missing: the checkpoint is built with
    weather_available=False and no risk, never a fabricated Low.
    """
    observation = _with_retry(
        weather_provider.get_weather,
        point.latitude,
        point.longitude,
        valid_time=point.eta,
    )
    if observation is None:
        return RouteCheckpoint(
            checkpoint_id=f"cp-{sequence}",
            latitude=point.latitude,
            longitude=point.longitude,
            distance_from_origin_miles=point.distance_miles,
            eta=point.eta,
            risk=None,
            weather_available=False,
        )
    return RouteCheckpoint(
        checkpoint_id=f"cp-{sequence}",
        latitude=point.latitude,
        longitude=point.longitude,
        distance_from_origin_miles=point.distance_miles,
        eta=point.eta,
        risk=calculate_risk(observation, load_weight_lb),
        weather_available=True,
    )


def _collect_warnings(
    routes: tuple[Route, Route, Route], recommendation: RecommendationResult
) -> tuple[str, ...]:
    """Describe ineligibility per route for the response payload."""
    warnings: list[str] = []
    for route in routes:
        assert route.summary is not None  # aggregate_routes always summarizes
        summary = route.summary
        if summary.no_travel_miles > 0:
            warnings.append(f"{route.route_id} ineligible: no-travel segments present")
            continue
        missing = sum(
            1 for checkpoint in route.checkpoints if not checkpoint.weather_available
        )
        unclassified = sum(
            1
            for checkpoint in route.checkpoints
            if checkpoint.weather_available and checkpoint.risk is None
        )
        if missing:
            warnings.append(
                f"{route.route_id} ineligible: weather unavailable "
                f"at {missing} checkpoint(s)"
            )
        elif unclassified:
            warnings.append(
                f"{route.route_id} ineligible: {unclassified} "
                "unclassified checkpoint(s)"
            )
    if recommendation.all_routes_ineligible:
        warnings.append("no eligible route available; no recommendation made")
    return tuple(warnings)
