"""Unit tests for the route-planning orchestration service."""

from datetime import UTC, datetime

import pytest

from providers.errors import ProviderPermanentError, ProviderTransientError
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider
from providers.protocols import RoutingProvider, WeatherProvider
from route_plans.services import (
    Endpoint,
    PlannedRoutePlan,
    plan_id_for,
    plan_route_plan,
)
from routing.checkpoints import Coordinate

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
