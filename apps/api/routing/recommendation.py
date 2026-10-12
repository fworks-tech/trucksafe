"""
Deterministic route recommendation.

The recommendation logic is independent from Django and external providers.
"""

from __future__ import annotations

from collections.abc import Iterable

from .domain import (
    RANKING_CRITERIA,
    RecommendationReason,
    RecommendationResult,
    Route,
    RouteSummary,
)

#: Ranking key in priority order: severe miles, high miles, average risk,
#: duration. Lower wins every field.
RecommendationKey = tuple[float, float, float, float]

#: Stable reason code for a selection by ranking key.
RECOMMENDATION_CODE = "LOWEST_RISK_RANKING"

#: Client-safe explanation for a selection by ranking key.
RECOMMENDATION_MESSAGE = "Selected using the deterministic route ranking criteria."


def recommendation_key(route: Route) -> RecommendationKey:
    """
    Return the deterministic ranking key for a summarized route.

    Lower values are preferred in this exact order:

    1. Fewest Severe-risk miles
    2. Fewest High-risk miles
    3. Lowest average risk score
    4. Shortest duration
    """
    summary = _require_summary(route)

    return (
        summary.severe_miles,
        summary.high_miles,
        summary.average_risk_score,
        summary.duration_seconds,
    )


def recommend_route(
    routes: Iterable[Route],
) -> RecommendationResult:
    """
    Select the best eligible route.

    Ineligible routes remain visible in the ranked result, but eligible
    routes always rank before ineligible routes. No route is recommended
    when every route is ineligible.

    Equal ranking keys preserve stable input order (Python's sort is
    stable), so repeated calls with the same input order are
    deterministic.

    Args:
        routes: Routes with calculated summaries.

    Returns:
        A deterministic recommendation result.

    Raises:
        ValueError: If no routes are provided or a route has no summary.
    """
    route_items = tuple(routes)

    if not route_items:
        raise ValueError("At least one route is required")

    for route in route_items:
        _require_summary(route)

    eligible_routes = tuple(
        route
        for route in route_items
        if route.summary is not None and route.summary.is_eligible
    )
    ineligible_routes = tuple(
        route
        for route in route_items
        if route.summary is not None and not route.summary.is_eligible
    )

    eligible_routes = tuple(sorted(eligible_routes, key=recommendation_key))
    ineligible_routes = tuple(sorted(ineligible_routes, key=recommendation_key))

    ranked_routes = eligible_routes + ineligible_routes
    ranked_route_ids = tuple(route.route_id for route in ranked_routes)

    winner = eligible_routes[0] if eligible_routes else None
    reason = (
        RecommendationReason(
            code=RECOMMENDATION_CODE,
            message=RECOMMENDATION_MESSAGE,
            ranking_key=recommendation_key(winner),
            criteria=RANKING_CRITERIA,
        )
        if winner is not None
        else None
    )

    return RecommendationResult(
        recommended_route_id=winner.route_id if winner is not None else None,
        ranked_route_ids=ranked_route_ids,
        all_routes_ineligible=winner is None,
        reason=reason,
    )


def _require_summary(route: Route) -> RouteSummary:
    """
    Return a route summary or raise a clear error.
    """
    if route.summary is None:
        raise ValueError(
            f"Route {route.route_id!r} must be aggregated before recommendation"
        )

    return route.summary
