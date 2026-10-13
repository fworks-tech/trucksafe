"""HTTP request validation and response shaping for route plans.

Request validation lives in DRF serializers so failures surface as 400
with the standard error envelope. Domain orchestration stays in
services; this module only translates between HTTP and domain types.
"""

from datetime import UTC, datetime
from typing import Any

from rest_framework import serializers

from routing.checkpoints import Coordinate
from routing.domain import RecommendationReason, Route, RouteCheckpoint
from routing.weather_grid import WeatherGrid

from .services import Endpoint, PlannedRoutePlan

CHECKPOINT_INTERVAL_CHOICES = (10, 25, 50)


class AwareDateTimeField(serializers.DateTimeField):
    """DateTimeField rejecting naive timestamps instead of assuming UTC."""

    def to_internal_value(self, data: object) -> datetime:
        """Parse ISO 8601 and require an explicit timezone designator."""
        if isinstance(data, str):
            try:
                parsed = datetime.fromisoformat(data.replace("Z", "+00:00"))
            except ValueError:
                pass  # fall through to the standard invalid message below
            else:
                if parsed.tzinfo is None or parsed.utcoffset() is None:
                    self.fail("naive")
        return super().to_internal_value(data)

    default_error_messages = {
        **serializers.DateTimeField.default_error_messages,
        "naive": "Departure must include a timezone, e.g. 2026-10-09T14:00:00Z.",
    }


class EndpointField(serializers.DictField):
    """Accept either {"address": str} or {"latitude", "longitude"}."""

    def to_internal_value(self, data: object) -> Endpoint:
        """Validate one endpoint form and build the domain Endpoint."""
        if isinstance(data, dict):
            return self._parse_dict(data)
        self.fail("not_a_dict", input_type=type(data).__name__)
        raise AssertionError("unreachable: fail() always raises")

    def _parse_dict(self, data: dict) -> Endpoint:
        """Build an Endpoint from a validated mapping."""
        address = data.get("address")
        has_coords = "latitude" in data or "longitude" in data
        if address is not None and has_coords:
            self.fail("both_forms")
        if address is not None:
            if not isinstance(address, str) or not address.strip():
                self.fail("blank_address")
            if len(address) > 200:
                self.fail("address_too_long")
            return Endpoint(address=address.strip())
        if has_coords:
            try:
                latitude = float(data["latitude"])
                longitude = float(data["longitude"])
            except (KeyError, TypeError, ValueError):
                self.fail("bad_coordinates")
            return Endpoint(
                coordinate=Coordinate(latitude=latitude, longitude=longitude)
            )
        self.fail("no_form")
        raise AssertionError("unreachable: fail() always raises")

    default_error_messages = {
        **serializers.DictField.default_error_messages,
        "both_forms": "Endpoint accepts either address or coordinates, not both.",
        "blank_address": "Endpoint address must not be blank.",
        "address_too_long": "Endpoint address must be at most 200 characters.",
        "bad_coordinates": "Endpoint coordinates must be numeric latitude/longitude.",
        "no_form": "Endpoint needs an address or latitude/longitude.",
    }


class RoutePlanRequestSerializer(serializers.Serializer):
    """Validate POST /api/v1/route-plans request bodies."""

    origin = EndpointField()
    destination = EndpointField()
    departure_at = AwareDateTimeField()
    load_weight_lb = serializers.FloatField(min_value=0)
    checkpoint_interval_miles = serializers.ChoiceField(
        choices=CHECKPOINT_INTERVAL_CHOICES, default=25
    )


def format_eta(value: datetime) -> str:
    """Render an aware datetime as an ISO 8601 UTC string with Z suffix."""
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def build_response(result: PlannedRoutePlan) -> dict[str, Any]:
    """Render the domain planning result as the response payload."""
    ranked = list(result.recommendation.ranked_route_ids)
    routes = []
    for route, geometry in zip(result.routes, result.geometries, strict=True):
        assert route.summary is not None  # aggregate_routes always summarizes
        summary = route.summary
        rank = ranked.index(route.route_id) + 1
        routes.append(
            {
                "id": route.route_id,
                "distance_miles": route.distance_miles,
                "duration_seconds": route.duration_seconds,
                "is_eligible": summary.is_eligible,
                "is_recommended": route.route_id
                == result.recommendation.recommended_route_id,
                "recommendation_rank": rank,
                "severe_miles": summary.severe_miles,
                "high_miles": summary.high_miles,
                "no_travel_miles": summary.no_travel_miles,
                "average_risk_score": summary.average_risk_score,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [point.longitude, point.latitude]
                        for point in (
                            route.enriched_geometry.points
                            if route.enriched_geometry is not None
                            else geometry.points
                        )
                    ],
                },
                "risk_segments": _risk_segments_payload(route),
                "checkpoints": [
                    _checkpoint_payload(sequence, checkpoint)
                    for sequence, checkpoint in enumerate(route.checkpoints, start=1)
                ],
            }
        )
    return {
        "id": result.plan_id,
        "status": "completed",
        "routing_provider": result.routing_provider,
        "mock_mode": result.mock_mode,
        "recommended_route_id": result.recommendation.recommended_route_id,
        "recommendation_reason": _reason_payload(result.recommendation.reason),
        "warnings": list(result.warnings),
        "routes": routes,
    }


def _reason_payload(reason: RecommendationReason | None) -> dict[str, Any] | None:
    """Render the recommendation explanation, or None when unselected."""
    if reason is None:
        return None
    return {
        "code": reason.code,
        "message": reason.message,
        "ranking_key": list(reason.ranking_key),
        "criteria": list(reason.criteria),
    }


def _risk_segments_payload(route: Route) -> list[dict[str, Any]]:
    """Render risk segments for a route, or an empty list when unavailable."""
    enriched = route.enriched_geometry
    if enriched is None:
        return []
    segments = []
    for segment in enriched.segments:
        risk = segment.risk
        segments.append(
            {
                "start_index": segment.start_index,
                "end_index": segment.end_index,
                "risk_level": risk.level.name if risk is not None else None,
                "risk_score": float(risk.score) if risk is not None else None,
                "risk_reasons": list(risk.reasons) if risk is not None else [],
            }
        )
    return segments


def _checkpoint_payload(sequence: int, checkpoint: RouteCheckpoint) -> dict[str, Any]:
    """Render one classified checkpoint."""
    risk = checkpoint.risk
    return {
        "sequence": sequence,
        "checkpoint_id": checkpoint.checkpoint_id,
        "distance_miles": checkpoint.distance_from_origin_miles,
        "latitude": checkpoint.latitude,
        "longitude": checkpoint.longitude,
        "eta": format_eta(checkpoint.eta),
        "weather_available": checkpoint.weather_available,
        "risk_level": risk.level.name if risk is not None else None,
        "risk_score": float(risk.score) if risk is not None else None,
        "risk_reasons": list(risk.reasons) if risk is not None else [],
    }


def build_weather_grid_response(grid: WeatherGrid) -> dict[str, Any]:
    """Render the weather grid as the response payload."""
    return {
        "route_id": grid.route_id,
        "route_plan_id": grid.route_plan_id,
        "forecast_start": format_eta(grid.forecast_start),
        "forecast_end": format_eta(grid.forecast_end),
        "cells": [
            {
                "cell_id": cell.cell_id,
                "latitude": cell.latitude,
                "longitude": cell.longitude,
                "valid_at": format_eta(cell.valid_at),
                "risk_level": cell.risk_level.name
                if cell.risk_level is not None
                else None,
                "risk_score": cell.risk_score,
                "risk_reasons": list(cell.risk_reasons),
                "weather": {
                    "wind_mph": cell.wind_mph,
                    "rain_inches_per_hour": cell.rain_inches_per_hour,
                    "snow_inches_per_hour": cell.snow_inches_per_hour,
                }
                if cell.wind_mph is not None
                else None,
            }
            for cell in grid.cells
        ],
    }
