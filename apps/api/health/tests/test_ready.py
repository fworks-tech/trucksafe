"""HTTP tests for GET /api/v1/ready."""

import pytest
from django.db import OperationalError
from django.test import override_settings
from rest_framework.test import APIClient

from providers.errors import ProviderTransientError
from route_plans.models import RoutePlan


@pytest.fixture
def client() -> APIClient:
    """Return a DRF test client."""
    return APIClient()


@pytest.mark.django_db
@pytest.mark.parametrize("url", ["/api/v1/ready", "/api/v1/ready/"])
def test_ready_reports_all_checks_when_available(client: APIClient, url: str) -> None:
    """Readiness returns 200 with one ok entry per dependency."""
    response = client.get(url, HTTP_X_REQUEST_ID="ready-1")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "checks": {
            "database": "ok",
            "routing_provider": "ok",
            "weather_provider": "ok",
        },
    }
    assert response["X-Request-ID"] == "ready-1"
    assert RoutePlan.objects.count() == 0


@pytest.mark.django_db
def test_ready_reports_database_unavailable(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A down database maps to a safe 503 with the failing check named."""
    monkeypatch.setattr(
        "health.checks.connection",
        _FailingConnection(),
    )
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "checks": {
            "database": "unavailable",
            "routing_provider": "ok",
            "weather_provider": "ok",
        },
    }
    assert response["X-Request-ID"]
    assert "Traceback" not in response.content.decode()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("target", "check"),
    [
        ("health.checks.get_routing_provider", "routing_provider"),
        ("health.checks.get_weather_provider", "weather_provider"),
    ],
    ids=["routing", "weather"],
)
def test_ready_reports_provider_unavailable(
    client: APIClient, monkeypatch: pytest.MonkeyPatch, target: str, check: str
) -> None:
    """A failing provider factory maps to a safe 503 naming that check."""

    def _down(*args: object, **kwargs: object) -> object:
        raise ProviderTransientError("mock outage")

    monkeypatch.setattr(target, _down)
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"][check] == "unavailable"
    assert body["checks"]["database"] == "ok"
    assert response["X-Request-ID"]
    assert "Traceback" not in response.content.decode()


class _FailingConnection:
    """Database connection stub whose availability check always fails."""

    def ensure_connection(self) -> None:
        """Raise like a database that refuses connections."""
        raise OperationalError("mock database outage")


@pytest.mark.django_db
def test_ready_reports_unresolvable_provider(client: APIClient) -> None:
    """A bad provider setting maps to 503, never a 500 or a leak."""
    with override_settings(TRUCKSAFE_ROUTING_PROVIDER="missing.module.Provider"):
        response = client.get("/api/v1/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["routing_provider"] == "unavailable"
    assert "Traceback" not in response.content.decode()


@pytest.mark.django_db
def test_ready_reports_non_provider_factory(client: APIClient) -> None:
    """A factory returning a non-provider maps to 503 for that check."""
    with override_settings(TRUCKSAFE_WEATHER_PROVIDER=lambda: object()):
        response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["weather_provider"] == "unavailable"
