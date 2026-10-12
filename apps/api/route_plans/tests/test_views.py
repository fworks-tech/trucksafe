"""Integration tests for POST /api/v1/route-plans."""

import pytest
from rest_framework.test import APIClient

from providers.errors import ProviderPermanentError
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider
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


@pytest.mark.django_db
def test_create_plan_returns_201_with_full_shape(
    client: APIClient, payload: dict
) -> None:
    """A valid request persists a plan and returns routes with risk data."""
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "completed"
    assert body["recommended_route_id"] is not None
    assert len(body["routes"]) == 3
    route = body["routes"][0]
    for key in (
        "id",
        "distance_miles",
        "duration_seconds",
        "is_eligible",
        "severe_miles",
        "high_miles",
        "no_travel_miles",
        "average_risk_score",
        "geometry",
        "checkpoints",
    ):
        assert key in route
    checkpoint = route["checkpoints"][0]
    assert checkpoint["eta"].endswith("Z")
    assert checkpoint["risk_level"] is not None
    assert RoutePlan.objects.filter(plan_id=body["id"]).exists()
    assert response["X-Request-ID"]


@pytest.mark.django_db
def test_repeat_request_returns_200_with_same_id(
    client: APIClient, payload: dict
) -> None:
    """Identical requests are idempotent on the deterministic plan id."""
    first = client.post(URL, payload, format="json")
    second = client.post(URL, payload, format="json")
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert RoutePlan.objects.count() == 1


@pytest.mark.django_db
def test_address_endpoints_are_geocoded(client: APIClient, payload: dict) -> None:
    """Address strings resolve through the provider geocoder."""
    payload["origin"] = {"address": "Denver, CO"}
    payload["destination"] = {"address": "Kansas City, MO"}
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    assert len(response.json()["routes"]) == 3


@pytest.mark.django_db
def test_missing_origin_returns_400_envelope(client: APIClient, payload: dict) -> None:
    """Invalid requests return the standard error envelope."""
    del payload["origin"]
    response = client.post(URL, payload, format="json")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST"
    assert error["message"]
    assert error["request_id"]
    assert response["X-Request-ID"] == error["request_id"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "mutation",
    [
        {"checkpoint_interval_miles": 30},
        {"load_weight_lb": -5},
        {"departure_at": "2026-10-09T14:00:00"},
        {"departure_at": "not-a-date"},
        {"origin": {"address": "  "}},
        {"origin": {"latitude": "north", "longitude": -87.0}},
    ],
    ids=[
        "bad-interval",
        "negative-load",
        "naive-departure",
        "bad-date",
        "blank-address",
        "bad-coords",
    ],
)
def test_invalid_payloads_return_400(
    client: APIClient, payload: dict, mutation: dict
) -> None:
    """Each spec-001 validation rule maps to a 400 envelope."""
    payload.update(mutation)
    response = client.post(URL, payload, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


@pytest.mark.django_db
def test_permanent_provider_failure_returns_422(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unroutable requests map permanent errors to 422."""
    monkeypatch.setattr(
        "route_plans.views.MockRoutingProvider",
        lambda: MockRoutingProvider(failure=ProviderPermanentError("no route")),
    )
    response = client.post(URL, payload, format="json")
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "UNROUTABLE"
    assert error["request_id"]


@pytest.mark.django_db
def test_transient_outage_returns_503(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Exhausted transient failures map to a safe 503 envelope."""
    monkeypatch.setattr(
        "route_plans.views.MockWeatherProvider",
        lambda: MockWeatherProvider(transient_failures=99),
    )
    response = client.post(URL, payload, format="json")
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["request_id"]
