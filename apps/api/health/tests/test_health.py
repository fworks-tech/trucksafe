"""HTTP tests for GET /api/v1/health."""

import pytest
from django.db import connection as db_connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from route_plans.models import RoutePlan


@pytest.fixture
def client() -> APIClient:
    """Return a DRF test client."""
    return APIClient()


@pytest.mark.django_db
@pytest.mark.parametrize("url", ["/api/v1/health", "/api/v1/health/"])
def test_health_returns_ok_without_side_effects(
    client: APIClient, url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Health is a shallow probe: exact shape, no writes or provider use."""

    def _forbidden(*args: object, **kwargs: object) -> object:
        raise AssertionError("health must not use providers")

    # Patch the mock implementations (resolved at call time) rather than
    # the factory functions: Django imports views lazily on the first
    # request, so patching factory module attributes here could leak
    # into view bindings for later tests.
    monkeypatch.setattr(
        "providers.mock_routing.MockRoutingProvider.plan_routes", _forbidden
    )
    monkeypatch.setattr(
        "providers.mock_routing.MockRoutingProvider.geocode", _forbidden
    )
    monkeypatch.setattr(
        "providers.mock_weather.MockWeatherProvider.get_weather", _forbidden
    )
    with CaptureQueriesContext(db_connection) as queries:
        response = client.get(url, HTTP_X_REQUEST_ID="health-1")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response["X-Request-ID"] == "health-1"
    writes = [
        query
        for query in queries
        if query["sql"].split(None, 1)[0] in ("INSERT", "UPDATE", "DELETE")
    ]
    assert writes == []
    assert RoutePlan.objects.count() == 0
