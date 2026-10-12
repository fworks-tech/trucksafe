from datetime import UTC, datetime

import pytest

from risk.schemas import RiskLevel
from routing.domain import (
    RiskAssessment,
    Route,
    RouteCheckpoint,
    RouteSummary,
)
from routing.recommendation import (
    recommend_route,
    recommendation_key,
)


def make_checkpoint(
    checkpoint_id: str,
    distance: float,
    level: RiskLevel = RiskLevel.LOW,
) -> RouteCheckpoint:
    """Build a classified checkpoint at a cumulative distance."""
    return RouteCheckpoint(
        checkpoint_id=checkpoint_id,
        latitude=39.0,
        longitude=-104.0,
        distance_from_origin_miles=distance,
        eta=datetime(2026, 10, 10, 14, 0, tzinfo=UTC),
        risk=RiskAssessment(
            level=level,
            score=float(level.value),
            reasons=("test reason",),
        ),
        weather_available=True,
    )


def make_route(
    route_id: str,
    summary: RouteSummary | None = None,
) -> Route:
    """Build a route carrying an explicit summary."""
    return Route(
        route_id=route_id,
        distance_miles=100.0,
        duration_seconds=7200.0,
        checkpoints=(
            make_checkpoint("origin", 0.0),
            make_checkpoint("destination", 100.0),
        ),
        summary=summary,
    )


def make_summary(
    *,
    severe_miles: float = 0.0,
    high_miles: float = 0.0,
    average_risk_score: float = 1.0,
    duration_seconds: float = 7200.0,
    is_eligible: bool = True,
) -> RouteSummary:
    """Eligible baseline summary with tunable ranking fields."""
    return RouteSummary(
        severe_miles=severe_miles,
        high_miles=high_miles,
        no_travel_miles=0.0,
        average_risk_score=average_risk_score,
        duration_seconds=duration_seconds,
        is_eligible=is_eligible,
    )


def test_recommendation_key_order() -> None:
    """The key orders severe, high, average, duration."""
    route = make_route(
        "route-a",
        make_summary(
            severe_miles=5.0,
            high_miles=10.0,
            average_risk_score=2.0,
            duration_seconds=8000.0,
        ),
    )

    assert recommendation_key(route) == (5.0, 10.0, 2.0, 8000.0)


def test_recommendation_prefers_fewer_severe_miles() -> None:
    """Severe miles outrank every other criterion."""
    route_a = make_route(
        "route-a",
        make_summary(severe_miles=10.0),
    )
    route_b = make_route(
        "route-b",
        make_summary(severe_miles=5.0),
    )

    result = recommend_route((route_a, route_b))

    assert result.recommended_route_id == "route-b"
    assert result.ranked_route_ids == ("route-b", "route-a")


def test_recommendation_uses_high_miles_as_second_tie_breaker() -> None:
    """High miles decide severe-mile ties."""
    route_a = make_route(
        "route-a",
        make_summary(high_miles=20.0),
    )
    route_b = make_route(
        "route-b",
        make_summary(high_miles=5.0),
    )

    result = recommend_route((route_a, route_b))

    assert result.recommended_route_id == "route-b"


def test_recommendation_uses_average_score_as_third_tie_breaker() -> None:
    """Average risk decides ties below high miles."""
    route_a = make_route(
        "route-a",
        make_summary(average_risk_score=2.5),
    )
    route_b = make_route(
        "route-b",
        make_summary(average_risk_score=1.5),
    )

    result = recommend_route((route_a, route_b))

    assert result.recommended_route_id == "route-b"


def test_recommendation_uses_duration_as_final_tie_breaker() -> None:
    """Duration only breaks full risk ties."""
    route_a = make_route(
        "route-a",
        make_summary(duration_seconds=9000.0),
    )
    route_b = make_route(
        "route-b",
        make_summary(duration_seconds=7000.0),
    )

    result = recommend_route((route_a, route_b))

    assert result.recommended_route_id == "route-b"


def test_ineligible_routes_are_not_recommended() -> None:
    """Eligibility beats even a perfect risk key."""
    eligible_route = make_route(
        "eligible",
        make_summary(
            severe_miles=20.0,
            is_eligible=True,
        ),
    )
    ineligible_route = make_route(
        "ineligible",
        make_summary(
            severe_miles=0.0,
            is_eligible=False,
        ),
    )

    result = recommend_route((eligible_route, ineligible_route))

    assert result.recommended_route_id == "eligible"
    assert result.all_routes_ineligible is False
    assert result.ranked_route_ids == ("eligible", "ineligible")


def test_no_travel_route_is_not_recommended_when_eligible_exists() -> None:
    """No-Travel routes stay visible but never win over eligible ones."""
    eligible_route = make_route(
        "eligible",
        make_summary(severe_miles=10.0, is_eligible=True),
    )
    no_travel_route = make_route(
        "no-travel",
        RouteSummary(
            severe_miles=0.0,
            high_miles=0.0,
            no_travel_miles=50.0,
            average_risk_score=5.0,
            duration_seconds=3600.0,
            is_eligible=False,
        ),
    )

    result = recommend_route((no_travel_route, eligible_route))

    assert result.recommended_route_id == "eligible"
    assert "no-travel" in result.ranked_route_ids
    assert result.all_routes_ineligible is False


def test_no_route_is_recommended_when_all_routes_are_ineligible() -> None:
    """Total failure yields None with the flag set."""
    route_a = make_route(
        "route-a",
        make_summary(is_eligible=False),
    )
    route_b = make_route(
        "route-b",
        make_summary(is_eligible=False),
    )

    result = recommend_route((route_a, route_b))

    assert result.recommended_route_id is None
    assert result.all_routes_ineligible is True
    assert result.ranked_route_ids == ("route-a", "route-b")


def test_recommendation_is_deterministic_for_equal_routes() -> None:
    """Repeated ranking is stable."""
    route_a = make_route(
        "route-a",
        make_summary(),
    )
    route_b = make_route(
        "route-b",
        make_summary(),
    )

    first_result = recommend_route((route_a, route_b))
    second_result = recommend_route((route_a, route_b))

    assert first_result == second_result
    assert first_result.recommended_route_id == "route-a"


def test_equal_keys_preserve_input_order() -> None:
    """Ties keep input order instead of flipping."""
    route_a = make_route("route-a", make_summary())
    route_b = make_route("route-b", make_summary())

    reversed_result = recommend_route((route_b, route_a))

    assert reversed_result.recommended_route_id == "route-b"
    assert reversed_result.ranked_route_ids == ("route-b", "route-a")


def test_recommendation_requires_summaries() -> None:
    """Unranked routes are a caller error, not a guess."""
    route = make_route("route-without-summary")

    with pytest.raises(
        ValueError,
        match="must be aggregated",
    ):
        recommendation_key(route)

    with pytest.raises(
        ValueError,
        match="must be aggregated",
    ):
        recommend_route((route,))


def test_recommendation_rejects_empty_input() -> None:
    """Ranking nothing is a caller error."""
    with pytest.raises(
        ValueError,
        match="At least one route",
    ):
        recommend_route(())


def test_recommendation_explains_the_winner() -> None:
    """The result carries the exact ranking key of the selected route."""
    route_a = make_route(
        "route-a",
        make_summary(severe_miles=10.0, high_miles=4.0),
    )
    route_b = make_route(
        "route-b",
        make_summary(severe_miles=2.0, high_miles=9.0),
    )

    result = recommend_route((route_a, route_b))
    reason = result.reason

    assert reason is not None
    assert reason.code == "LOWEST_RISK_RANKING"
    assert reason.message
    assert reason.ranking_key == recommendation_key(route_b)
    assert reason.ranking_key == (2.0, 9.0, 1.0, 7200.0)
    assert list(reason.criteria) == [
        "severe_miles",
        "high_miles",
        "average_risk_score",
        "duration_seconds",
    ]


def test_recommendation_reason_is_deterministic() -> None:
    """Repeated recommendations explain themselves identically."""
    routes = (
        make_route("route-a", make_summary(severe_miles=3.0)),
        make_route("route-b", make_summary(severe_miles=7.0)),
    )

    first = recommend_route(routes)
    second = recommend_route(routes)

    assert first.reason == second.reason


def test_recommendation_reason_follows_tie_order() -> None:
    """Equal keys keep input order and the reason names the first route."""
    route_a = make_route("route-a", make_summary())
    route_b = make_route("route-b", make_summary())

    result = recommend_route((route_a, route_b))

    assert result.recommended_route_id == "route-a"
    assert result.reason is not None
    assert result.reason.ranking_key == recommendation_key(route_a)


def test_all_ineligible_routes_have_no_reason() -> None:
    """No eligible route means no selection and no explanation."""
    routes = (
        make_route("route-a", make_summary(is_eligible=False)),
        make_route("route-b", make_summary(is_eligible=False)),
    )

    result = recommend_route(routes)

    assert result.recommended_route_id is None
    assert result.all_routes_ineligible is True
    assert result.reason is None
