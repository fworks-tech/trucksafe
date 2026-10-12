"""
Route-level risk aggregation.

This module is framework-independent. It does not depend on Django,
HTTP providers, databases, or external services.
"""

from __future__ import annotations

from collections.abc import Iterable
from math import isfinite

from risk.schemas import RiskLevel, RiskResult

from .domain import RiskAssessment, Route, RouteCheckpoint, RouteSummary

CheckpointRisk = RiskAssessment | RiskResult


def aggregate_route_summary(route: Route) -> RouteSummary:
    """Calculate the risk summary for a route.

    Each checkpoint represents the end of a route segment. The segment
    distance is `current.distance - previous.distance`; the current
    checkpoint's risk applies to that segment.

    Origin handling: the first checkpoint normally sits at distance 0
    and therefore contributes zero segment miles, but it still
    contributes its risk score to the average when weather is available.
    If the first checkpoint is not at distance 0, its segment is measured
    from an implicit origin at 0.0. An origin checkpoint with unavailable
    weather (or without a usable risk classification) contributes zero
    miles yet still makes the whole route ineligible -- missing weather
    is never treated as Low.

    The average is the unweighted mean of the scores of checkpoints with
    available weather and a usable risk classification; checkpoints
    without either are excluded from the average (they affect eligibility
    instead). When no checkpoint has a usable classification the average
    is 0.0, which lies outside the valid score range (1-5) and therefore
    also reads as "no data" in ranked output.

    A route is ineligible when any checkpoint has unavailable weather,
    lacks a usable risk classification, or carries No Travel risk.
    Checkpoint reasons are preserved on the checkpoints themselves;
    aggregation only sums miles and never recalculates weather risk.

    Args:
        route: Route containing ordered checkpoints.

    Returns:
        A calculated RouteSummary.

    Raises:
        ValueError: If checkpoint distances are invalid or not ordered.
    """
    checkpoints = tuple(route.checkpoints)

    if not checkpoints:
        raise ValueError("A route must contain at least one checkpoint")

    _validate_checkpoints(checkpoints)

    severe_miles = 0.0
    high_miles = 0.0
    no_travel_miles = 0.0

    risk_scores: list[float] = []
    is_eligible = True

    previous_distance = 0.0

    for checkpoint in checkpoints:
        segment_miles = checkpoint.distance_from_origin_miles - previous_distance
        previous_distance = checkpoint.distance_from_origin_miles

        if not checkpoint.weather_available:
            # Missing weather must never be interpreted as Low risk.
            is_eligible = False
            continue

        if checkpoint.risk is None:
            # A checkpoint without a risk classification is not safe to use.
            is_eligible = False
            continue

        risk_level = _get_risk_level(checkpoint.risk)
        risk_scores.append(_get_risk_score(checkpoint.risk))

        if risk_level == RiskLevel.SEVERE:
            severe_miles += segment_miles
        elif risk_level == RiskLevel.HIGH:
            high_miles += segment_miles
        elif risk_level == RiskLevel.NO_TRAVEL:
            no_travel_miles += segment_miles
            is_eligible = False

    if no_travel_miles > 0:
        is_eligible = False

    average_risk_score = sum(risk_scores) / len(risk_scores) if risk_scores else 0.0

    return RouteSummary(
        severe_miles=_round_stable(severe_miles),
        high_miles=_round_stable(high_miles),
        no_travel_miles=_round_stable(no_travel_miles),
        average_risk_score=_round_stable(average_risk_score),
        duration_seconds=float(route.duration_seconds),
        is_eligible=is_eligible,
    )


def aggregate_routes(routes: Iterable[Route]) -> tuple[Route, ...]:
    """Return routes with calculated summaries.

    This function does not mutate existing route instances; it returns
    new instances via ``route.with_summary(summary)``.

    Args:
        routes: Routes to summarize.

    Returns:
        A tuple containing routes with summaries.

    Raises:
        ValueError: If no routes are provided.
    """
    route_items = tuple(routes)

    if not route_items:
        raise ValueError("At least one route is required")

    return tuple(
        route.with_summary(aggregate_route_summary(route)) for route in route_items
    )


def _validate_checkpoints(checkpoints: tuple[RouteCheckpoint, ...]) -> None:
    """Validate cumulative checkpoint distances.

    Distances must be finite, non-negative, and monotonically
    non-decreasing.
    """
    previous_distance = 0.0

    for index, checkpoint in enumerate(checkpoints):
        distance = checkpoint.distance_from_origin_miles

        if not isfinite(distance):
            raise ValueError(
                "Checkpoint distance must be finite: "
                f"index={index}, distance={distance!r}"
            )

        if distance < 0:
            raise ValueError(
                "Checkpoint distance cannot be negative: "
                f"index={index}, distance={distance!r}"
            )

        if distance < previous_distance:
            raise ValueError("Checkpoint distances must be monotonically increasing")

        previous_distance = distance


def _get_risk_level(risk: CheckpointRisk) -> RiskLevel:
    """Return the RiskLevel from a checkpoint risk result."""
    if not isinstance(risk.level, RiskLevel):
        raise ValueError(f"Unknown risk level: {risk.level!r}")
    return risk.level


def _get_risk_score(risk: CheckpointRisk) -> float:
    """Return the numeric score from a checkpoint risk result."""
    try:
        numeric_score = float(risk.score)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid risk score: {risk.score!r}") from exc

    if not isfinite(numeric_score):
        raise ValueError(f"Risk score must be finite: {risk.score!r}")

    return numeric_score


def _round_stable(value: float) -> float:
    """Round to 6 decimals to avoid floating-point noise."""
    return round(value, 6)


__all__ = [
    "CheckpointRisk",
    "aggregate_route_summary",
    "aggregate_routes",
]
