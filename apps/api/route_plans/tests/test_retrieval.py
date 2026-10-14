"""Integration tests for GET /api/v1/route-plans/{id}."""

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    """Return a DRF test client."""
    return APIClient()


@pytest.fixture
def payload() -> dict:
    """Return a valid coordinate-based request body (mock providers)."""
    return {
        "origin": {"latitude": 41.8781, "longitude": -87.6298},
        "destination": {"latitude": 42.3314, "longitude": -83.0458},
        "departure_at": "2026-10-09T14:00:00Z",
        "load_weight_lb": 35000,
        "checkpoint_interval_miles": 25,
    }


def _create(client: APIClient, payload: dict) -> dict:
    """POST a plan with the default mock providers and return its body."""
    response = client.post("/api/v1/route-plans", payload, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    return body


@pytest.mark.django_db
def test_get_returns_stored_plan(client: APIClient, payload: dict) -> None:
    """GET returns the exact payload POST stored, without recomputing."""
    created = _create(client, payload)
    response = client.get(f"/api/v1/route-plans/{created['id']}")
    assert response.status_code == 200
    assert response.json() == created


@pytest.mark.django_db
def test_get_unknown_id_returns_404_envelope(client: APIClient) -> None:
    """Unknown ids fail with the standard error envelope."""
    response = client.get("/api/v1/route-plans/" + "0" * 64)
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert error["request_id"]
    assert response["X-Request-ID"] == error["request_id"]


@pytest.mark.django_db
def test_get_is_stable_across_calls(client: APIClient, payload: dict) -> None:
    """Repeated GETs return the same stored payload."""
    created = _create(client, payload)
    url = f"/api/v1/route-plans/{created['id']}"
    assert client.get(url).json() == client.get(url).json() == created
