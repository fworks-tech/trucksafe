"""Unit tests for RoutePlan persistence semantics."""

import pytest

from route_plans.models import RoutePlan


@pytest.mark.django_db
def test_plan_id_is_the_primary_key() -> None:
    """The deterministic digest identifies the stored record."""
    plan = RoutePlan.objects.create(
        plan_id="a" * 64,
        origin={"latitude": 41.0, "longitude": -87.0},
        destination={"latitude": 42.0, "longitude": -83.0},
        departure_at="2026-10-09T14:00:00Z",
        load_weight_lb=35000.0,
        checkpoint_interval_miles=25.0,
        recommended_route_id="route-2",
        response={"id": "a" * 64},
    )
    assert RoutePlan.objects.get(pk="a" * 64) == plan
    assert plan.status == "completed"
