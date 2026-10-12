"""Integration tests for POST /api/v1/route-plans."""

import json
from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from providers.errors import ProviderPermanentError
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider
from providers.protocols import RouteGeometry, RoutePlanRequest
from route_plans.models import RoutePlan
from routing.checkpoints import Coordinate

URL = "/api/v1/route-plans"


class _StubRoutingProvider:
    """Routing provider with an injectable plan_routes implementation."""

    def __init__(
        self,
        plan_routes: Callable[
            [RoutePlanRequest], tuple[RouteGeometry, RouteGeometry, RouteGeometry]
        ],
    ) -> None:
        """Store the injected route planner and a mock for geocoding."""
        self._plan_routes = plan_routes
        self._mock = MockRoutingProvider()

    def geocode(self, address: str) -> Coordinate:
        """Delegate address resolution to the deterministic mock."""
        return self._mock.geocode(address)

    def plan_routes(
        self, request: RoutePlanRequest
    ) -> tuple[RouteGeometry, RouteGeometry, RouteGeometry]:
        """Plan routes with the injected implementation."""
        return self._plan_routes(request)


def _raw_json(payload: dict) -> str:
    """Encode a payload, leaving non-finite placeholders for raw tokens."""
    return json.dumps(payload)


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
    reason = body["recommendation_reason"]
    assert reason["code"] == "LOWEST_RISK_RANKING"
    assert reason["message"]
    assert len(reason["ranking_key"]) == 4
    assert reason["criteria"] == [
        "severe_miles",
        "high_miles",
        "average_risk_score",
        "duration_seconds",
    ]
    route = body["routes"][0]
    for key in (
        "id",
        "distance_miles",
        "duration_seconds",
        "is_eligible",
        "is_recommended",
        "recommendation_rank",
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
        "route_plans.views.get_routing_provider",
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
        "route_plans.views.get_weather_provider",
        lambda: MockWeatherProvider(transient_failures=99),
    )
    response = client.post(URL, payload, format="json")
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["request_id"]


@pytest.mark.django_db
@pytest.mark.parametrize("token", ["Infinity", "-Infinity", "NaN"])
def test_non_finite_load_returns_controlled_error(
    client: APIClient, payload: dict, token: str
) -> None:
    """Non-finite JSON numbers are rejected by parsing, before planning.

    The configured JSON parser refuses non-compliant floats with its own
    400 shape, so they never reach the service boundary (which rejects
    non-finite loads with ValueError, covered in test_services.py).
    """
    payload["load_weight_lb"] = token
    raw = _raw_json(payload).replace(f'"{token}"', token)
    response = client.post(URL, raw, content_type="application/json")
    assert response.status_code == 400
    assert "Traceback" not in response.content.decode()
    assert RoutePlan.objects.count() == 0


@pytest.mark.django_db
def test_out_of_range_coordinates_return_400(client: APIClient, payload: dict) -> None:
    """Coordinates outside WGS84 map to a 400 envelope."""
    payload["origin"] = {"latitude": 91.0, "longitude": 0.0}
    response = client.post(URL, payload, format="json")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST"
    assert error["request_id"]
    assert "Traceback" not in response.content.decode()


@pytest.mark.django_db
def test_malformed_provider_response_returns_400(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Invalid provider data maps to a safe 400 envelope with request id."""

    def broken_plan_routes(
        request: RoutePlanRequest,
    ) -> tuple[RouteGeometry, RouteGeometry, RouteGeometry]:
        raise ValueError("route geometry needs at least origin and destination")

    monkeypatch.setattr(
        "route_plans.views.get_routing_provider",
        lambda: _StubRoutingProvider(broken_plan_routes),
    )
    response = client.post(URL, payload, format="json")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST"
    assert error["request_id"]
    assert response["X-Request-ID"] == error["request_id"]
    assert "Traceback" not in response.content.decode()


@pytest.mark.django_db
def test_all_ineligible_plan_has_null_recommendation(
    client: APIClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Total weather outage selects nothing and explains nothing."""
    monkeypatch.setattr(
        "route_plans.views.get_weather_provider",
        lambda: MockWeatherProvider(always_unavailable=True),
    )
    response = client.post(URL, payload, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["recommended_route_id"] is None
    assert body["recommendation_reason"] is None
    assert body["warnings"]


@pytest.mark.django_db
def test_valid_request_id_is_propagated(client: APIClient, payload: dict) -> None:
    """A valid client request id echoes in the header and the envelope."""
    response = client.post(URL, payload, format="json", HTTP_X_REQUEST_ID="plan-1")
    assert response.status_code == 201
    assert response["X-Request-ID"] == "plan-1"
    del payload["origin"]
    errored = client.post(URL, payload, format="json", HTTP_X_REQUEST_ID="plan-2")
    assert errored.status_code == 400
    assert errored["X-Request-ID"] == "plan-2"
    assert errored.json()["error"]["request_id"] == "plan-2"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "incoming",
    ["has space", "semi;colon", "line\nbreak", "x" * 129, ""],
    ids=["space", "semicolon", "newline", "too-long", "empty"],
)
def test_invalid_request_id_is_replaced(
    client: APIClient, payload: dict, incoming: str
) -> None:
    """Unsafe client request ids are replaced with a generated one."""
    del payload["origin"]
    response = client.post(URL, payload, format="json", HTTP_X_REQUEST_ID=incoming)
    assert response.status_code == 400
    header = response["X-Request-ID"]
    assert header != incoming
    assert response.json()["error"]["request_id"] == header
