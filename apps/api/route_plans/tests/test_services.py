"""Unit tests for the route-planning orchestration service."""

from datetime import UTC, datetime

import pytest

from providers.errors import ProviderPermanentError, ProviderTransientError
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider
from providers.protocols import (
    RouteGeometry,
    RoutePlanRequest,
    RoutingProvider,
    WeatherProvider,
)
from risk.schemas import WeatherObservation
from route_plans.services import (
    Endpoint,
    PlannedRoutePlan,
    _collect_warnings,
    plan_id_for,
    plan_route_plan,
)
from routing.aggregation import aggregate_routes
from routing.checkpoints import Coordinate
from routing.domain import Route, RouteCheckpoint
from routing.recommendation import recommend_route, recommendation_key

DEPARTURE = datetime(2026, 10, 9, 14, 0, tzinfo=UTC)
CHI = Endpoint(coordinate=Coordinate(latitude=41.8781, longitude=-87.6298))
DET = Endpoint(coordinate=Coordinate(latitude=42.3314, longitude=-83.0458))


def plan(
    origin: Endpoint = CHI,
    destination: Endpoint = DET,
    departure_at: datetime = DEPARTURE,
    load_weight_lb: float = 35000.0,
    checkpoint_interval_miles: float = 25.0,
    routing_provider: RoutingProvider | None = None,
    weather_provider: WeatherProvider | None = None,
) -> PlannedRoutePlan:
    """Run the service with mock providers and sane defaults."""
    return plan_route_plan(
        origin=origin,
        destination=destination,
        departure_at=departure_at,
        load_weight_lb=load_weight_lb,
        checkpoint_interval_miles=checkpoint_interval_miles,
        routing_provider=routing_provider or MockRoutingProvider(),
        weather_provider=weather_provider or MockWeatherProvider(),
    )


def test_service_returns_three_summarized_routes() -> None:
    """The full flow yields three aggregated routes with a recommendation."""
    result = plan()
    assert len(result.routes) == 3
    assert len(result.geometries) == 3
    assert all(route.summary is not None for route in result.routes)
    assert result.recommendation.recommended_route_id is not None
    assert result.plan_id


def test_plan_id_is_deterministic() -> None:
    """Identical requests hash to the same plan id."""
    assert plan().plan_id == plan().plan_id


def test_plan_id_matches_helper() -> None:
    """The result id equals the standalone plan-id function."""
    result = plan()
    assert result.plan_id == plan_id_for(CHI, DET, DEPARTURE, 35000.0, 25.0)


def test_service_accepts_address_endpoints() -> None:
    """Address endpoints resolve through provider geocoding."""
    result = plan(
        origin=Endpoint(address="Denver, CO"),
        destination=Endpoint(address="Kansas City, MO"),
    )
    assert len(result.routes) == 3


def test_service_accepts_mixed_endpoint_forms() -> None:
    """One address and one coordinate pair combine into a valid plan."""
    result = plan(origin=Endpoint(address="Chicago, IL"), destination=DET)
    assert len(result.routes) == 3


def test_missing_weather_makes_all_routes_ineligible() -> None:
    """Total weather outage yields warnings and no recommendation."""
    result = plan(weather_provider=MockWeatherProvider(always_unavailable=True))
    summaries = [route.summary for route in result.routes]
    assert all(s is not None and not s.is_eligible for s in summaries)
    assert result.recommendation.recommended_route_id is None
    assert result.recommendation.all_routes_ineligible
    assert result.warnings


def test_transient_weather_failure_is_retried() -> None:
    """One transient blip is absorbed by the retry policy."""
    result = plan(weather_provider=MockWeatherProvider(transient_failures=1))
    assert len(result.routes) == 3


def test_exhausted_transient_failures_propagate() -> None:
    """Persistent transient outages surface for the view to map."""
    with pytest.raises(ProviderTransientError):
        plan(weather_provider=MockWeatherProvider(transient_failures=99))


def test_permanent_routing_failure_propagates() -> None:
    """Permanent failures are never retried, only propagated."""
    provider = MockRoutingProvider(failure=ProviderPermanentError("no route"))
    with pytest.raises(ProviderPermanentError):
        plan(routing_provider=provider)
    assert provider.calls == 1


def test_identical_coordinates_are_unroutable() -> None:
    """Zero-distance requests fail permanently at the provider."""
    with pytest.raises(ProviderPermanentError):
        plan(origin=CHI, destination=CHI)


def test_negative_load_weight_is_rejected() -> None:
    """Negative loads are caller errors, not provider failures."""
    with pytest.raises(ValueError, match="load_weight_lb"):
        plan(load_weight_lb=-1.0)


def test_endpoint_requires_exactly_one_form() -> None:
    """Endpoints reject both-forms and neither-form input."""
    with pytest.raises(ValueError, match="exactly one"):
        Endpoint()
    with pytest.raises(ValueError, match="exactly one"):
        Endpoint(address="Denver, CO", coordinate=CHI.coordinate)
    with pytest.raises(ValueError, match="blank"):
        Endpoint(address="   ")


@pytest.mark.parametrize("load", [float("inf"), float("-inf"), float("nan")])
def test_non_finite_load_weight_is_rejected(load: float) -> None:
    """Non-finite loads are caller errors, not provider failures."""
    with pytest.raises(ValueError, match="load_weight_lb"):
        plan(load_weight_lb=load)


def test_out_of_range_coordinates_are_rejected() -> None:
    """Coordinates outside WGS84 fail at the request boundary."""
    far_north = Endpoint(coordinate=Coordinate(latitude=91.0, longitude=0.0))
    with pytest.raises(ValueError, match="latitude"):
        plan(origin=far_north)


class _MalformedRoutingProvider:
    """Simulates a provider whose own response validation failed."""

    def geocode(self, address: str) -> Coordinate:
        """Delegate geocoding to the deterministic mock."""
        return MockRoutingProvider().geocode(address)

    def plan_routes(
        self, request: RoutePlanRequest
    ) -> tuple[RouteGeometry, RouteGeometry, RouteGeometry]:
        """Reject the response the way a validating adapter would."""
        raise ValueError("route geometry needs at least origin and destination")


def test_malformed_provider_response_propagates_value_error() -> None:
    """Invalid provider data surfaces as ValueError for the view to map."""
    with pytest.raises(ValueError, match="route geometry"):
        plan(
            origin=Endpoint(address="Denver, CO"),
            routing_provider=_MalformedRoutingProvider(),
        )


def test_unclassified_checkpoints_warn_without_weather_loss() -> None:
    """Weather-present but unrisked checkpoints warn as unclassified."""
    routes = tuple(
        Route(
            route_id=f"route-{index}",
            distance_miles=100.0,
            duration_seconds=3600.0,
            checkpoints=(
                RouteCheckpoint(
                    checkpoint_id="cp-1",
                    latitude=41.0,
                    longitude=-87.0,
                    distance_from_origin_miles=0.0,
                    eta=DEPARTURE,
                    risk=None,
                    weather_available=True,
                ),
            ),
        )
        for index in (1, 2, 3)
    )
    summarized = aggregate_routes(routes)
    three = (summarized[0], summarized[1], summarized[2])
    warnings = _collect_warnings(three, recommend_route(three))
    assert any("unclassified checkpoint" in warning for warning in warnings)


def test_result_carries_the_winning_ranking_key() -> None:
    """The recommendation reason names the exact key that won."""
    result = plan()
    reason = result.recommendation.reason
    assert reason is not None
    assert reason.code == "LOWEST_RISK_RANKING"
    winner = next(
        route
        for route in result.routes
        if route.route_id == result.recommendation.recommended_route_id
    )
    assert reason.ranking_key == recommendation_key(winner)
    assert list(reason.criteria) == [
        "severe_miles",
        "high_miles",
        "average_risk_score",
        "duration_seconds",
    ]


def test_ineligible_plan_carries_no_reason() -> None:
    """Total outage selects nothing and explains nothing."""
    result = plan(weather_provider=MockWeatherProvider(always_unavailable=True))
    assert result.recommendation.recommended_route_id is None
    assert result.recommendation.reason is None


def test_routes_carry_enriched_geometry_with_segments() -> None:
    """Happy path produces enriched geometry and risk segments per route."""
    result = plan()
    for route in result.routes:
        assert route.enriched_geometry is not None
        assert len(route.enriched_geometry.segments) > 0
        for segment in route.enriched_geometry.segments:
            assert segment.end_index > segment.start_index
            assert segment.risk is not None


def test_unavailable_weather_produces_null_segment_risk() -> None:
    """Routes with unavailable weather still carry segments with null risk."""
    result = plan(weather_provider=MockWeatherProvider(always_unavailable=True))
    for route in result.routes:
        if route.enriched_geometry is not None:
            for segment in route.enriched_geometry.segments:
                assert segment.risk is None


def test_enriched_geometry_preserves_endpoints() -> None:
    """Enriched geometry starts at origin and ends at destination."""
    result = plan()
    for route, geometry in zip(result.routes, result.geometries, strict=True):
        assert route.enriched_geometry is not None
        enriched = route.enriched_geometry.points
        assert enriched[0] == geometry.points[0]
        assert enriched[-1] == geometry.points[-1]


class _RecordingWeatherProvider:
    """Capture every lookup timestamp, then return calm weather."""

    def __init__(self) -> None:
        """Initialize the empty timestamp log."""
        self.valid_times: list[datetime] = []

    def get_weather(
        self, latitude: float, longitude: float, *, valid_time: datetime
    ) -> WeatherObservation:
        """Log the lookup time and return a low-risk observation."""
        self.valid_times.append(valid_time)
        return WeatherObservation(
            wind_mph=10.0, rain_inches_per_hour=0.0, snow_inches_per_hour=0.0
        )


def test_weather_lookups_use_distinct_checkpoint_etas() -> None:
    """Each checkpoint ETA reaches the weather provider as its valid_time."""
    weather = _RecordingWeatherProvider()
    result = plan(weather_provider=weather)

    first_route = result.routes[0]
    expected = [checkpoint.eta for checkpoint in first_route.checkpoints]
    assert len(expected) >= 2
    assert expected == sorted(expected)
    assert len(set(expected)) == len(expected)
    assert weather.valid_times[: len(expected)] == expected
    assert all(valid_time.tzinfo is not None for valid_time in weather.valid_times)
