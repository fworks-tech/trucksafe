"""End-to-end HTTP tests for POST /api/v1/route-plans.

These tests exercise the full boundary (URL routing, serializer
validation, orchestration, providers, risk, aggregation,
recommendation, serialization, persistence) with deterministic
providers. Scenarios already covered in test_views.py are not
repeated; this file fills the gaps: deep success-payload invariants,
UTC normalization, partial weather loss, severe-weather
ineligibility, exact retry call counts, and failure hygiene.
"""

from datetime import datetime

import pytest
from rest_framework.test import APIClient

from providers.errors import ProviderPermanentError
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider
from risk.schemas import WeatherObservation
from route_plans.models import RoutePlan

URL = "/api/v1/route-plans"


@pytest.fixture
def client() -> APIClient:
    """Return a DRF test client."""
    return APIClient()


@pytest.fixture
def payload() -> dict:
    """Return a valid coordinate-based request body."""
    return {
        "origin": {"latitude": 41.8781, "longitude": -87.6298},
        "destination": {"latitude": 42.3314, "longitude": -83.0458},
        "departure_at": "2026-10-09T14:00:00Z",
        "load_weight_lb": 35000,
        "checkpoint_interval_miles": 25,
    }


class _PartialWeatherProvider:
    """Weather unavailable west of a meridian, delegated east of it."""

    def __init__(self, meridian: float = -86.0) -> None:
        """Store the availability boundary and a deterministic delegate."""
        self._meridian = meridian
        self._delegate = MockWeatherProvider()
        self.calls = 0

    def get_weather(
        self, latitude: float, longitude: float, *, valid_time: datetime
    ) -> WeatherObservation | None:
        """Return None west of the meridian, else the mock observation."""
        self.calls += 1
        if longitude < self._meridian:
            return None
        return self._delegate.get_weather(latitude, longitude, valid_time=valid_time)


class _SevereWeatherProvider:
    """No-travel wind everywhere, forcing every route ineligible."""

    def __init__(self) -> None:
        """Initialize the lookup counter."""
        self.calls = 0

    def get_weather(
        self, latitude: float, longitude: float, *, valid_time: datetime
    ) -> WeatherObservation:
        """Return a no-travel observation for every checkpoint."""
        self.calls += 1
        return WeatherObservation(
            wind_mph=60.0, rain_inches_per_hour=0.0, snow_inches_per_hour=0.0
        )


@pytest.mark.django_db
def test_success_payload_satisfies_end_to_end_invariants(
    client: APIClient, payload: dict
) -> None:
    """A valid plan carries ordered checkpoints with UTC ETAs and risk."""
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    assert response["Content-Type"] == "application/json"
    body = response.json()
    assert len(body["id"]) == 64  # sha256 hex plan id
    assert body["status"] == "completed"
    assert isinstance(body["warnings"], list)

    routes = body["routes"]
    assert [route["id"] for route in routes] == ["route-1", "route-2", "route-3"]
    for route in routes:
        assert route["distance_miles"] > 0
        assert route["duration_seconds"] > 0
        assert len(route["geometry"]["coordinates"]) >= 2
        assert route["is_eligible"] is True
        checkpoints = route["checkpoints"]
        assert len(checkpoints) >= 2
        assert checkpoints[0]["distance_miles"] == 0
        last = checkpoints[-1]
        assert last["latitude"] == pytest.approx(payload["destination"]["latitude"])
        assert last["longitude"] == pytest.approx(payload["destination"]["longitude"])
        assert [cp["checkpoint_id"] for cp in checkpoints] == [
            cp["checkpoint_id"]
            for cp in sorted(checkpoints, key=lambda c: c["sequence"])
        ]
        distances = [cp["distance_miles"] for cp in checkpoints]
        assert distances == sorted(distances)
        etas = [
            datetime.fromisoformat(cp["eta"].replace("Z", "+00:00"))
            for cp in checkpoints
        ]
        assert all(eta.tzinfo is not None for eta in etas)
        assert etas == sorted(etas)
        for checkpoint in checkpoints:
            assert checkpoint["weather_available"] is True
            assert checkpoint["risk_level"] is not None
            assert checkpoint["risk_score"] is not None
            assert checkpoint["risk_reasons"]

    recommended = body["recommended_route_id"]
    assert recommended in ("route-1", "route-2", "route-3")
    assert sum(route["is_recommended"] for route in routes) == 1
    assert next(r for r in routes if r["is_recommended"])["id"] == recommended


@pytest.mark.django_db
def test_equivalent_utc_departures_share_plan_id(
    client: APIClient, payload: dict
) -> None:
    """Timezone-equivalent departures normalize to one idempotent plan."""
    first = client.post(URL, payload, format="json")
    payload["departure_at"] = "2026-10-09T16:00:00+02:00"
    second = client.post(URL, payload, format="json")
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert RoutePlan.objects.count() == 1


@pytest.mark.django_db
def test_identical_coordinates_are_unroutable(client: APIClient, payload: dict) -> None:
    """Zero-distance routing maps to the documented 422 without a row."""
    payload["destination"] = dict(payload["origin"])
    response = client.post(URL, payload, format="json")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNROUTABLE"
    assert RoutePlan.objects.count() == 0


@pytest.mark.django_db
def test_transient_routing_failure_recovers_with_two_calls(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One transient routing failure retries once, then succeeds."""
    provider = MockRoutingProvider(transient_failures=1)
    monkeypatch.setattr("route_plans.views.get_routing_provider", lambda: provider)
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    assert provider.calls == 2
    assert RoutePlan.objects.count() == 1


@pytest.mark.django_db
def test_transient_weather_failure_recovers(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One transient weather failure retries, then the plan succeeds."""
    provider = MockWeatherProvider(transient_failures=1)
    monkeypatch.setattr("route_plans.views.get_weather_provider", lambda: provider)
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    assert provider.calls > 1
    assert response.json()["recommended_route_id"] is not None


@pytest.mark.django_db
def test_permanent_failure_is_not_retried_and_persists_nothing(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Permanent routing failures call once and leave no partial row."""
    provider = MockRoutingProvider(failure=ProviderPermanentError("no route"))
    monkeypatch.setattr("route_plans.views.get_routing_provider", lambda: provider)
    response = client.post(URL, payload, format="json")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNROUTABLE"
    assert "Traceback" not in response.content.decode()
    assert provider.calls == 1
    assert RoutePlan.objects.count() == 0


@pytest.mark.django_db
def test_exhausted_transients_persist_nothing(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Exhausted retries return 503 and never write a partial plan."""
    monkeypatch.setattr(
        "route_plans.views.get_weather_provider",
        lambda: MockWeatherProvider(transient_failures=99),
    )
    response = client.post(URL, payload, format="json")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert response.json()["error"]["request_id"] == response["X-Request-ID"]
    assert RoutePlan.objects.count() == 0


@pytest.mark.django_db
def test_partial_weather_loss_is_explicit_and_deterministic(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unavailable checkpoints stay missing: never Low, always warned."""
    monkeypatch.setattr(
        "route_plans.views.get_weather_provider", _PartialWeatherProvider
    )
    first = client.post(URL, payload, format="json")
    second = client.post(URL, payload, format="json")
    assert first.status_code == 201
    body = first.json()
    missing = [
        checkpoint
        for route in body["routes"]
        for checkpoint in route["checkpoints"]
        if not checkpoint["weather_available"]
    ]
    assert missing, "expected at least one weather-unavailable checkpoint"
    for checkpoint in missing:
        assert checkpoint["risk_level"] is None
        assert checkpoint["risk_score"] is None
        assert checkpoint["risk_reasons"] == []
    for route in body["routes"]:
        route_missing = any(
            not checkpoint["weather_available"] for checkpoint in route["checkpoints"]
        )
        if route_missing:
            assert route["is_eligible"] is False
    assert any("weather unavailable" in warning for warning in body["warnings"])
    assert second.status_code == 200
    assert second.json()["warnings"] == body["warnings"]
    recommended = body["recommended_route_id"]
    if recommended is None:
        assert body["recommendation_reason"] is None
    else:
        route = next(r for r in body["routes"] if r["id"] == recommended)
        assert route["is_eligible"] is True


@pytest.mark.django_db
def test_severe_weather_makes_all_routes_ineligible(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No-travel everywhere: three ineligible routes, no recommendation."""
    monkeypatch.setattr(
        "route_plans.views.get_weather_provider", _SevereWeatherProvider
    )
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    body = response.json()
    assert len(body["routes"]) == 3
    for route in body["routes"]:
        assert route["is_eligible"] is False
        assert route["no_travel_miles"] > 0
        assert route["is_recommended"] is False
    assert body["recommended_route_id"] is None
    assert body["recommendation_reason"] is None
    assert body["warnings"]
    assert RoutePlan.objects.filter(plan_id=body["id"]).exists()


@pytest.mark.django_db
def test_invalid_request_id_on_success_is_replaced(
    client: APIClient, payload: dict
) -> None:
    """Unsafe request ids are replaced, never echoed, even on success."""
    response = client.post(URL, payload, format="json", HTTP_X_REQUEST_ID="bad\nid")
    assert response.status_code == 201
    header = response["X-Request-ID"]
    assert "\n" not in header
    assert header != "bad\nid"


@pytest.mark.django_db
def test_mock_plans_self_identify_provider_and_warning(
    client: APIClient, payload: dict
) -> None:
    """The default mock plan marks its geometry source explicitly (Option B):
    provider name, mock flag, and a visible warning. No silent fallback."""
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["routing_provider"] == "mock"
    assert body["mock_mode"] is True
    assert any("mock routing provider" in warning for warning in body["warnings"])
