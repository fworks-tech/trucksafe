from datetime import UTC, datetime

import pytest

from risk.schemas import RiskLevel, RiskResult
from routing.aggregation import (
    aggregate_route_summary,
    aggregate_routes,
)
from routing.domain import (
    RiskAssessment,
    Route,
    RouteCheckpoint,
)


def make_eta() -> datetime:
    """Fixed timezone-aware departure used by checkpoint fixtures."""
    return datetime(2026, 10, 10, 14, 0, tzinfo=UTC)


def make_risk(
    level: RiskLevel,
    *,
    reasons: tuple[str, ...] = ("test reason",),
) -> RiskAssessment:
    """Risk assessment at the given level with a test reason."""
    return RiskAssessment(
        level=level,
        score=float(level.value),
        reasons=reasons,
    )


def make_checkpoint(
    checkpoint_id: str,
    distance: float,
    *,
    level: RiskLevel | None = None,
    weather_available: bool = True,
) -> RouteCheckpoint:
    """Build a classified checkpoint at a cumulative distance."""
    risk = make_risk(level) if level is not None else None

    return RouteCheckpoint(
        checkpoint_id=checkpoint_id,
        latitude=39.0,
        longitude=-104.0,
        distance_from_origin_miles=distance,
        eta=make_eta(),
        risk=risk,
        weather_available=weather_available,
    )


def make_route(
    checkpoints: tuple[RouteCheckpoint, ...],
    *,
    duration_seconds: float = 7200.0,
) -> Route:
    """Build a route from explicit checkpoints."""
    return Route(
        route_id="route-1",
        distance_miles=100.0,
        duration_seconds=duration_seconds,
        checkpoints=checkpoints,
    )


def test_aggregate_route_summary_calculates_risk_miles() -> None:
    """Each checkpoint risk colors the segment ending at it."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("checkpoint-1", 10.0, level=RiskLevel.HIGH),
            make_checkpoint("checkpoint-2", 25.0, level=RiskLevel.SEVERE),
            make_checkpoint("destination", 40.0, level=RiskLevel.NO_TRAVEL),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.severe_miles == 15.0
    assert summary.high_miles == 10.0
    assert summary.no_travel_miles == 15.0
    assert summary.average_risk_score == 3.25
    assert summary.duration_seconds == 7200.0
    assert summary.is_eligible is False


def test_all_low_route_is_eligible() -> None:
    """Clean routes stay eligible with zero risk miles."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("destination", 100.0, level=RiskLevel.LOW),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.severe_miles == 0.0
    assert summary.high_miles == 0.0
    assert summary.no_travel_miles == 0.0
    assert summary.average_risk_score == 1.0
    assert summary.is_eligible is True


def test_moderate_route_is_eligible() -> None:
    """Non-low risk alone does not disqualify a route."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.MODERATE),
            make_checkpoint("destination", 50.0, level=RiskLevel.MODERATE),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.average_risk_score == 2.0
    assert summary.is_eligible is True


def test_segment_lengths_come_from_cumulative_differences() -> None:
    """Segments derive from cumulative distance deltas."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("mid", 30.0, level=RiskLevel.HIGH),
            make_checkpoint("destination", 100.0, level=RiskLevel.LOW),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.high_miles == 30.0
    assert summary.severe_miles == 0.0


def test_origin_contributes_zero_miles_but_counts_in_average() -> None:
    """The origin scores without coloring miles."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.SEVERE),
            make_checkpoint("destination", 100.0, level=RiskLevel.LOW),
        )
    )

    summary = aggregate_route_summary(route)

    # Origin segment is 0 miles, so no severe miles accrue.
    assert summary.severe_miles == 0.0
    # But the origin risk score still counts in the average.
    assert summary.average_risk_score == 2.5


def test_origin_missing_weather_makes_route_ineligible() -> None:
    """Blind origins fail the route without adding miles."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, weather_available=False),
            make_checkpoint("destination", 100.0, level=RiskLevel.LOW),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.severe_miles == 0.0
    assert summary.high_miles == 0.0
    assert summary.no_travel_miles == 0.0
    assert summary.is_eligible is False


def test_duration_propagates_to_summary() -> None:
    """Summaries carry the route duration unchanged."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("destination", 100.0, level=RiskLevel.LOW),
        ),
        duration_seconds=5400.0,
    )

    summary = aggregate_route_summary(route)

    assert summary.duration_seconds == 5400.0


def test_risk_reasons_are_preserved_on_checkpoints() -> None:
    """Aggregation never drops explanatory reasons."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            RouteCheckpoint(
                checkpoint_id="destination",
                latitude=39.0,
                longitude=-104.0,
                distance_from_origin_miles=100.0,
                eta=make_eta(),
                risk=RiskAssessment(
                    level=RiskLevel.SEVERE,
                    score=4.0,
                    reasons=("wind 45-54 mph",),
                ),
                weather_available=True,
            ),
        )
    )

    (summarized,) = aggregate_routes((route,))

    assert summarized.checkpoints[1].risk is not None
    assert summarized.checkpoints[1].risk.reasons == ("wind 45-54 mph",)
    assert summarized.summary is not None
    assert summarized.summary.severe_miles == 100.0


def test_engine_risk_result_is_reused() -> None:
    """Engine outputs aggregate without conversion."""
    route = make_route(
        (
            RouteCheckpoint(
                checkpoint_id="origin",
                latitude=39.0,
                longitude=-104.0,
                distance_from_origin_miles=0.0,
                eta=make_eta(),
                risk=RiskResult(level=RiskLevel.LOW, reasons=("wind",)),
                weather_available=True,
            ),
            RouteCheckpoint(
                checkpoint_id="destination",
                latitude=39.0,
                longitude=-104.0,
                distance_from_origin_miles=100.0,
                eta=make_eta(),
                risk=RiskResult(level=RiskLevel.SEVERE, reasons=("wind",)),
                weather_available=True,
            ),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.severe_miles == 100.0
    assert summary.average_risk_score == 2.5


def test_aggregate_route_summary_marks_missing_weather_ineligible() -> None:
    """Missing weather is ineligible, never Low."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint(
                "checkpoint-1",
                25.0,
                weather_available=False,
            ),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.is_eligible is False
    assert summary.severe_miles == 0.0
    assert summary.high_miles == 0.0
    assert summary.no_travel_miles == 0.0
    assert summary.average_risk_score == 1.0


def test_aggregate_route_summary_marks_missing_risk_ineligible() -> None:
    """Unclassified checkpoints fail the route with a 0.0 average."""
    route = make_route(
        (
            make_checkpoint(
                "origin",
                0.0,
                weather_available=True,
            ),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.is_eligible is False
    assert summary.average_risk_score == 0.0


def test_low_and_moderate_segments_do_not_count_as_high_risk_miles() -> None:
    """Only High/Severe/No-Travel color mileage buckets."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("moderate", 10.0, level=RiskLevel.MODERATE),
            make_checkpoint("low", 20.0, level=RiskLevel.LOW),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.severe_miles == 0.0
    assert summary.high_miles == 0.0
    assert summary.no_travel_miles == 0.0
    assert summary.average_risk_score == 1.333333


def test_destination_segment_is_included() -> None:
    """The final segment always counts toward the totals."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("destination", 100.0, level=RiskLevel.SEVERE),
        )
    )

    summary = aggregate_route_summary(route)

    assert summary.severe_miles == 100.0


def test_checkpoint_distances_must_be_monotonic() -> None:
    """Decreasing distances are rejected at the boundary."""
    with pytest.raises(
        ValueError,
        match="monotonically increasing",
    ):
        make_route(
            (
                make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
                make_checkpoint("invalid", 20.0, level=RiskLevel.HIGH),
                make_checkpoint("destination", 10.0, level=RiskLevel.LOW),
            )
        )


def test_checkpoint_distances_must_be_finite() -> None:
    """Infinite distances cannot form segments."""
    with pytest.raises(
        ValueError,
        match="finite",
    ):
        make_checkpoint("invalid", float("inf"), level=RiskLevel.HIGH)


def test_aggregate_routes_adds_summaries_without_mutating_input() -> None:
    """Batch summarization copies frozen routes."""
    route = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("destination", 100.0, level=RiskLevel.LOW),
        )
    )

    summarized_routes = aggregate_routes((route,))

    assert len(summarized_routes) == 1
    assert summarized_routes[0].summary is not None
    assert route.summary is None


def test_aggregate_multiple_routes() -> None:
    """Each route summarizes independently in one pass."""
    first = make_route(
        (
            make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
            make_checkpoint("destination", 100.0, level=RiskLevel.LOW),
        )
    )
    second_checkpoints = (
        make_checkpoint("origin", 0.0, level=RiskLevel.LOW),
        make_checkpoint("destination", 50.0, level=RiskLevel.HIGH),
    )
    second = Route(
        route_id="route-2",
        distance_miles=50.0,
        duration_seconds=3600.0,
        checkpoints=second_checkpoints,
    )

    summarized = aggregate_routes((first, second))

    assert len(summarized) == 2
    assert summarized[0].summary is not None
    assert summarized[1].summary is not None
    assert summarized[0].summary.high_miles == 0.0
    assert summarized[1].summary.high_miles == 50.0
    assert first.summary is None
    assert second.summary is None


def test_aggregate_routes_rejects_empty_input() -> None:
    """Summarizing nothing is a caller error."""
    with pytest.raises(
        ValueError,
        match="At least one route",
    ):
        aggregate_routes(())
