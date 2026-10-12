"""Integration tests for GET /api/v1/route-plans/{id}/weather-grid."""

from collections.abc import Callable

import pytest
from _pytest.monkeypatch import MonkeyPatch
from rest_framework.test import APIClient

from providers.errors import ProviderPermanentError
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider
from providers.protocols import RouteGeometry, RoutePlanRequest
from routing.checkpoints import Coordinate

URL_BASE = "/api/v1/route-plans"


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


def _valid_payload() -> dict:
    """Return a valid coordinate-based request body."""
    return {
        "origin": {"latitude": 41.8781, "longitude": -87.6298},
        "destination": {"latitude": 42.3314, "longitude": -83.0458},
        "departure_at": "2026-10-09T14:00:00Z",
        "load_weight_lb": 35000,
        "checkpoint_interval_miles": 25,
    }


def _create_plan(client: APIClient) -> dict:
    """Create a route plan and return the response."""
    response = client.post(URL_BASE, _valid_payload(), format="json")
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def client() -> APIClient:
    """Return a DRF test client."""
    return APIClient()


@pytest.mark.django_db
def test_weather_grid_returns_200_with_valid_shape(client: APIClient) -> None:
    """A valid request returns the weather grid with cells and risk data."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    response = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    assert response.status_code == 200
    body = response.json()

    assert body["route_id"] == plan["routes"][0]["id"]
    assert body["route_plan_id"] == plan_id
    assert "forecast_start" in body
    assert "forecast_end" in body
    assert body["forecast_start"].endswith("Z")
    assert body["forecast_end"].endswith("Z")
    assert isinstance(body["cells"], list)
    assert len(body["cells"]) > 0

    cell = body["cells"][0]
    for key in (
        "cell_id",
        "latitude",
        "longitude",
        "valid_at",
        "risk_level",
        "risk_score",
        "risk_reasons",
    ):
        assert key in cell
    assert cell["valid_at"].endswith("Z")
    assert response["X-Request-ID"]


@pytest.mark.django_db
def test_weather_grid_offset_hours_range(client: APIClient) -> None:
    """All valid offset hours (0-48) return a grid."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    for offset in (0, 12, 24, 36, 48):
        response = client.get(
            f"{URL_BASE}/{plan_id}/weather-grid?offset_hours={offset}"
        )
        assert response.status_code == 200, (
            f"offset_hours={offset} failed: {response.json()}"
        )
        body = response.json()
        assert len(body["cells"]) > 0


@pytest.mark.django_db
def test_weather_grid_missing_offset_returns_400(client: APIClient) -> None:
    """Missing offset_hours returns a 400 envelope."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    response = client.get(f"{URL_BASE}/{plan_id}/weather-grid")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST"
    assert "offset_hours" in error["message"]


@pytest.mark.django_db
def test_weather_grid_invalid_offset_returns_400(client: APIClient) -> None:
    """Non-integer offset_hours returns a 400 envelope."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    response = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=abc")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST"
    assert "integer" in error["message"]


@pytest.mark.django_db
def test_weather_grid_offset_out_of_range_returns_400(client: APIClient) -> None:
    """Offset hours outside 0..48 returns a 400 envelope."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    for offset in (-1, 49):
        response = client.get(
            f"{URL_BASE}/{plan_id}/weather-grid?offset_hours={offset}"
        )
        assert response.status_code == 400, f"offset={offset} should fail"
        error = response.json()["error"]
        assert error["code"] == "INVALID_REQUEST"
        assert "0..48" in error["message"]


@pytest.mark.django_db
def test_weather_grid_not_found_returns_404(client: APIClient) -> None:
    """Non-existent route plan returns 404."""
    response = client.get(f"{URL_BASE}/nonexistent/weather-grid?offset_hours=0")
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert "nonexistent" in error["message"]


@pytest.mark.django_db
def test_weather_grid_unavailable_weather_returns_null_risk(
    client: APIClient, monkeypatch: MonkeyPatch
) -> None:
    """Weather provider returning None yields cells with null risk."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    # Override weather provider to always return unavailable for grid query
    monkeypatch.setattr(
        "route_plans.views.get_weather_provider",
        lambda: MockWeatherProvider(always_unavailable=True),
    )

    response = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    assert response.status_code == 200
    body = response.json()

    for cell in body["cells"]:
        assert cell["risk_level"] is None
        assert cell["risk_score"] is None
        assert cell["risk_reasons"] == []


@pytest.mark.django_db
def test_weather_grid_transient_failure_returns_503(
    client: APIClient, monkeypatch: MonkeyPatch
) -> None:
    """Exhausted transient weather failures return 503."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    # Override weather provider for grid query
    monkeypatch.setattr(
        "route_plans.views.get_weather_provider",
        lambda: MockWeatherProvider(transient_failures=99),
    )

    response = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"


@pytest.mark.django_db
def test_weather_grid_permanent_failure_returns_422(
    client: APIClient, monkeypatch: MonkeyPatch
) -> None:
    """Permanent weather provider error returns 422."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    # Override weather provider for grid query
    monkeypatch.setattr(
        "route_plans.views.get_weather_provider",
        lambda: MockWeatherProvider(failure=ProviderPermanentError("weather failed")),
    )

    response = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "UNROUTABLE"


@pytest.mark.django_db
def test_weather_grid_request_id_propagated(client: APIClient) -> None:
    """Client request id propagates to response header."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    response = client.get(
        f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0",
        HTTP_X_REQUEST_ID="weather-grid-1",
    )
    assert response.status_code == 200
    assert response["X-Request-ID"] == "weather-grid-1"


@pytest.mark.django_db
def test_weather_grid_deterministic_output(client: APIClient) -> None:
    """Repeated requests for same plan and offset return identical cells."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    r1 = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    r2 = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    assert r1.json()["cells"] == r2.json()["cells"]


@pytest.mark.django_db
def test_weather_grid_different_offsets_different_cells(client: APIClient) -> None:
    """Different offset hours produce different valid_at timestamps."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    r0 = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    r12 = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=12")

    assert r0.status_code == 200
    assert r12.status_code == 200

    # The valid_at timestamps should differ
    cells_0 = r0.json()["cells"]
    cells_12 = r12.json()["cells"]
    assert cells_0[0]["valid_at"] != cells_12[0]["valid_at"]


@pytest.mark.django_db
def test_weather_grid_cell_contains_raw_weather_when_available(
    client: APIClient,
) -> None:
    """Cells with available weather include raw weather fields."""
    plan = _create_plan(client)
    plan_id = plan["id"]

    response = client.get(f"{URL_BASE}/{plan_id}/weather-grid?offset_hours=0")
    assert response.status_code == 200
    body = response.json()

    cell = body["cells"][0]
    if cell["risk_level"] is not None:
        assert cell["weather"] is not None
        assert "wind_mph" in cell["weather"]
        assert "rain_inches_per_hour" in cell["weather"]
        assert "snow_inches_per_hour" in cell["weather"]
    else:
        assert cell["weather"] is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
