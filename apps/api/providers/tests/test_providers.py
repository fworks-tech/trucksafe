"""Unit tests for provider errors, protocols, and mock providers."""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from providers.errors import (
    ProviderError,
    ProviderPermanentError,
    ProviderTransientError,
)
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider
from providers.protocols import (
    RouteGeometry,
    RoutePlanRequest,
    RoutingProvider,
    WeatherProvider,
)
from risk.schemas import WeatherObservation
from routing.checkpoints import Coordinate

ORIGIN = Coordinate(latitude=41.0, longitude=-87.0)
DESTINATION = Coordinate(latitude=42.5, longitude=-83.0)


def make_request() -> RoutePlanRequest:
    """Build a valid Chicago-to-Detroit plan request."""
    return RoutePlanRequest(
        origin=ORIGIN,
        destination=DESTINATION,
        departure=datetime(2026, 6, 1, 8, 0, tzinfo=UTC),
    )


def make_time() -> datetime:
    """Build a fixed timezone-aware lookup time."""
    return datetime(2026, 6, 1, 12, 0, tzinfo=UTC)


# --- errors ---


def test_transient_and_permanent_are_provider_errors() -> None:
    """Both failure kinds share the common provider base class."""
    assert issubclass(ProviderTransientError, ProviderError)
    assert issubclass(ProviderPermanentError, ProviderError)


def test_transient_and_permanent_are_distinct() -> None:
    """Retry policy can tell retryable failures from permanent ones."""
    assert not issubclass(ProviderTransientError, ProviderPermanentError)
    assert not issubclass(ProviderPermanentError, ProviderTransientError)


# --- protocols ---


def test_route_geometry_rejects_short_polyline() -> None:
    """A geometry needs at least origin and destination points."""
    with pytest.raises(ValueError, match="at least origin and destination"):
        RouteGeometry(
            points=(ORIGIN,),
            distance_miles=10.0,
            duration_seconds=600.0,
        )


def test_route_geometry_rejects_non_positive_totals() -> None:
    """Zero or infinite totals cannot describe a route."""
    points = (ORIGIN, DESTINATION)
    with pytest.raises(ValueError, match="distance_miles"):
        RouteGeometry(points=points, distance_miles=0.0, duration_seconds=600.0)
    with pytest.raises(ValueError, match="duration_seconds"):
        RouteGeometry(points=points, distance_miles=10.0, duration_seconds=float("inf"))


def test_route_plan_request_rejects_naive_departure() -> None:
    """Provider input follows the same tz-aware rule as the domain."""
    with pytest.raises(ValueError, match="timezone-aware"):
        RoutePlanRequest(
            origin=ORIGIN,
            destination=DESTINATION,
            departure=datetime(2026, 6, 1, 8, 0),
        )


def test_route_plan_request_rejects_out_of_range_coordinates() -> None:
    """Provider input rejects coordinates no real adapter could route."""
    with pytest.raises(ValueError, match="origin latitude"):
        RoutePlanRequest(
            origin=Coordinate(latitude=91.0, longitude=0.0),
            destination=DESTINATION,
            departure=make_time(),
        )
    with pytest.raises(ValueError, match="destination longitude"):
        RoutePlanRequest(
            origin=ORIGIN,
            destination=Coordinate(latitude=0.0, longitude=181.0),
            departure=make_time(),
        )


def test_route_plan_request_accepts_non_utc_departure() -> None:
    """Non-UTC aware departures are valid; the instant is preserved."""
    request = RoutePlanRequest(
        origin=ORIGIN,
        destination=DESTINATION,
        departure=datetime(2026, 10, 9, 11, 0, tzinfo=UTC).astimezone(
            timezone(timedelta(hours=-3))
        ),
    )
    assert len(MockRoutingProvider().plan_routes(request)) == 3


def test_mocks_satisfy_provider_protocols() -> None:
    """Mock adapters conform to the contracts real adapters will follow."""
    assert isinstance(MockRoutingProvider(), RoutingProvider)
    assert isinstance(MockWeatherProvider(), WeatherProvider)


# --- mock routing ---


def test_mock_routing_returns_exactly_three_routes() -> None:
    """PR3 always has three candidates to rank."""
    assert len(MockRoutingProvider().plan_routes(make_request())) == 3


def test_mock_routing_is_deterministic() -> None:
    """Two providers return identical routes for the same request."""
    assert MockRoutingProvider().plan_routes(
        make_request()
    ) == MockRoutingProvider().plan_routes(make_request())


def test_mock_routing_variants_differ() -> None:
    """Candidates are distinct routes, not copies."""
    routes = MockRoutingProvider().plan_routes(make_request())
    assert len({r.distance_miles for r in routes}) == 3
    assert routes[1].distance_miles < routes[0].distance_miles


def test_mock_routing_geometries_are_valid() -> None:
    """Points stay in WGS84 bounds with positive finite totals."""
    for route in MockRoutingProvider().plan_routes(make_request()):
        assert route.points[0] == ORIGIN
        assert route.points[-1] == DESTINATION
        for point in route.points:
            assert -90.0 <= point.latitude <= 90.0
            assert -180.0 <= point.longitude <= 180.0


def test_mock_routing_rejects_zero_distance() -> None:
    """A zero-distance request is a permanent failure, never retried."""
    request = RoutePlanRequest(origin=ORIGIN, destination=ORIGIN, departure=make_time())
    with pytest.raises(ProviderPermanentError):
        MockRoutingProvider().plan_routes(request)


def test_mock_routing_permanent_failure() -> None:
    """A configured failure raises on every call."""
    provider = MockRoutingProvider(failure=ProviderPermanentError("no route"))
    with pytest.raises(ProviderPermanentError):
        provider.plan_routes(make_request())
    with pytest.raises(ProviderPermanentError):
        provider.plan_routes(make_request())
    assert provider.calls == 2


def test_mock_routing_transient_failures_then_succeeds() -> None:
    """Leading transient failures let retry logic reach success."""
    provider = MockRoutingProvider(transient_failures=2)
    with pytest.raises(ProviderTransientError):
        provider.plan_routes(make_request())
    with pytest.raises(ProviderTransientError):
        provider.plan_routes(make_request())
    assert len(provider.plan_routes(make_request())) == 3


def test_mock_routing_rejects_negative_transient_failures() -> None:
    """Failure counters cannot be negative."""
    with pytest.raises(ValueError, match="transient_failures"):
        MockRoutingProvider(transient_failures=-1)


# --- mock weather ---


def test_mock_weather_is_deterministic() -> None:
    """Repeated lookups for the same point and time agree."""
    provider = MockWeatherProvider()
    first = provider.get_weather(41.0, -87.0, valid_time=make_time())
    second = provider.get_weather(41.0, -87.0, valid_time=make_time())
    assert first == second
    assert isinstance(first, WeatherObservation)


def test_mock_weather_matches_across_equivalent_timezones() -> None:
    """Timezone-equivalent ETAs describe the same instant and agree."""
    provider = MockWeatherProvider()
    utc_time = datetime(2026, 10, 9, 14, 0, tzinfo=UTC)
    sao_paulo = utc_time.astimezone(timezone(timedelta(hours=-3)))
    assert provider.get_weather(
        41.0, -87.0, valid_time=utc_time
    ) == provider.get_weather(41.0, -87.0, valid_time=sao_paulo)


def test_mock_weather_varies_with_eta() -> None:
    """The lookup uses time, not just coordinates (spec 002)."""
    provider = MockWeatherProvider()
    morning = provider.get_weather(
        41.0, -87.0, valid_time=datetime(2026, 6, 1, 6, 0, tzinfo=UTC)
    )
    evening = provider.get_weather(
        41.0, -87.0, valid_time=datetime(2026, 6, 1, 22, 0, tzinfo=UTC)
    )
    assert morning != evening


def test_mock_weather_observations_are_plausible() -> None:
    """Base observations use finite non-negative canonical units."""
    for lat, lon in ((41.0, -87.0), (0.0, 0.0), (-33.9, 151.2)):
        obs = MockWeatherProvider().get_weather(lat, lon, valid_time=make_time())
        assert obs is not None
        assert obs.wind_mph >= 0
        assert obs.rain_inches_per_hour >= 0
        assert obs.snow_inches_per_hour >= 0


def test_mock_weather_override_forces_observation() -> None:
    """Overrides pin a point to a fixed scenario."""
    storm = WeatherObservation(
        wind_mph=60.0, rain_inches_per_hour=0.0, snow_inches_per_hour=0.0
    )
    provider = MockWeatherProvider(overrides={(41.0, -87.0): storm})
    assert provider.get_weather(41.0, -87.0, valid_time=make_time()) == storm


def test_mock_weather_none_override_means_unavailable() -> None:
    """A None override simulates a blind spot without inventing Low risk."""
    provider = MockWeatherProvider(overrides={(41.0, -87.0): None})
    assert provider.get_weather(41.0, -87.0, valid_time=make_time()) is None


def test_mock_weather_always_unavailable() -> None:
    """The global flag simulates total weather outages."""
    provider = MockWeatherProvider(always_unavailable=True)
    assert provider.get_weather(41.0, -87.0, valid_time=make_time()) is None


def test_mock_weather_permanent_failure() -> None:
    """A configured failure raises on every call."""
    provider = MockWeatherProvider(failure=ProviderPermanentError("auth denied"))
    with pytest.raises(ProviderPermanentError):
        provider.get_weather(41.0, -87.0, valid_time=make_time())


def test_mock_weather_transient_failures_then_succeeds() -> None:
    """Leading transient failures let retry logic reach success."""
    provider = MockWeatherProvider(transient_failures=1)
    with pytest.raises(ProviderTransientError):
        provider.get_weather(41.0, -87.0, valid_time=make_time())
    assert provider.get_weather(41.0, -87.0, valid_time=make_time()) is not None


def test_mock_weather_rejects_negative_transient_failures() -> None:
    """Failure counters cannot be negative on the weather side either."""
    with pytest.raises(ValueError, match="transient_failures"):
        MockWeatherProvider(transient_failures=-1)


def test_mock_weather_rejects_non_datetime_time() -> None:
    """A non-datetime valid_time is a caller error, not a lookup."""
    with pytest.raises(ValueError, match="valid_time must be a datetime"):
        MockWeatherProvider().get_weather(41.0, -87.0, valid_time="noon")  # type: ignore[arg-type]


def test_mock_weather_rejects_naive_time() -> None:
    """Lookups require timezone-aware timestamps like the rest of the domain."""
    with pytest.raises(ValueError, match="timezone-aware"):
        MockWeatherProvider().get_weather(
            41.0, -87.0, valid_time=datetime(2026, 6, 1, 12, 0)
        )


def test_mock_weather_rejects_non_finite_coordinates() -> None:
    """Non-finite coordinates are caller errors, not provider failures."""
    with pytest.raises(ValueError, match="finite"):
        MockWeatherProvider().get_weather(float("nan"), -87.0, valid_time=make_time())


# --- mock geocoding ---


def test_mock_geocode_resolves_known_addresses() -> None:
    """Tabled addresses resolve to fixed coordinates, case-insensitively."""
    assert MockRoutingProvider().geocode("Denver, CO") == Coordinate(
        latitude=39.7392, longitude=-104.9903
    )
    assert MockRoutingProvider().geocode("denver, co") == MockRoutingProvider().geocode(
        "  DENVER, CO  "
    )


def test_mock_geocode_places_demo_cities_at_real_coordinates() -> None:
    """Cities offered by the frontend must land on the true map location.

    Regression: "Houston, TX" once hashed to a point over Florida because
    the mock table only knew four cities.
    """
    houston = MockRoutingProvider().geocode("Houston, TX")
    assert houston == Coordinate(latitude=29.7604, longitude=-95.3698)
    for address in ("Chicago, IL", "Phoenix, AZ", "Atlanta, GA", "Seattle, WA"):
        resolved = MockRoutingProvider().geocode(address)
        assert 25.0 <= resolved.latitude <= 48.0
        assert -125.0 <= resolved.longitude <= -67.0


def test_mock_geocode_derives_stable_fallback_coordinates() -> None:
    """Unknown addresses derive deterministic in-bounds coordinates."""
    first = MockRoutingProvider().geocode("Springfield, ZZ")
    second = MockRoutingProvider().geocode("Springfield, ZZ")
    assert first == second
    assert 25.0 <= first.latitude <= 48.0
    assert -125.0 <= first.longitude <= -67.0


def test_mock_geocode_rejects_blank_address() -> None:
    """Blank addresses are permanent failures, never retried."""
    with pytest.raises(ProviderPermanentError):
        MockRoutingProvider().geocode("   ")


def test_mock_geocode_transient_failures_then_succeeds() -> None:
    """Leading transient failures let retry logic reach success."""
    provider = MockRoutingProvider(transient_failures=1)
    with pytest.raises(ProviderTransientError):
        provider.geocode("Denver, CO")
    assert provider.geocode("Denver, CO") == Coordinate(
        latitude=39.7392, longitude=-104.9903
    )
