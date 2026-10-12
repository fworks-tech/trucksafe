"""
Persistence for computed route plans.

Plans are immutable snapshots: the deterministic plan id is the primary
key, so repeating an identical request returns the stored record instead
of recomputing. Only successful plans are stored; failed requests return
an error envelope without a record.
"""

from django.db import models


class RoutePlan(models.Model):
    """
    Stored result of POST /api/v1/route-plans.

    Attributes:
        plan_id: SHA-256 hex digest of the normalized request.
        origin: Normalized origin endpoint payload.
        destination: Normalized destination endpoint payload.
        departure_at: Planned departure as an aware UTC datetime.
        load_weight_lb: Truck load weight in pounds.
        checkpoint_interval_miles: Sampling interval, one of 10/25/50.
        status: Plan lifecycle state; always completed in this slice.
        recommended_route_id: Winning route, or None when all ineligible.
        response: Full response payload as returned to the caller.
        created_at: Record creation timestamp.
    """

    plan_id = models.CharField(max_length=64, primary_key=True)
    origin = models.JSONField()
    destination = models.JSONField()
    departure_at = models.DateTimeField()
    load_weight_lb = models.FloatField()
    checkpoint_interval_miles = models.FloatField()
    status = models.CharField(max_length=16, default="completed")
    recommended_route_id = models.CharField(max_length=64, null=True, blank=True)
    response = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "route_plans"
