from datetime import UTC, datetime

import pytest

from risk.schemas import RiskLevel, RiskResult
from routing.domain import (
    RecommendationResult,
    RiskAssessment,
    Route,
    RouteCheckpoint,
    RouteSummary,
)


def make_eta() -> datetime:
    """Fixed timezone-aware departure used by checkpoint fixtures."""
    return datetime(2026, 10, 10, 14, 0, tzinfo=UTC)


def make_checkpoint(
    *,
    checkpoint_id: str = "checkpoint-1",
    distance: float = 0.0,
    risk: RiskAssessment | RiskResult | None = None,
    weather_available: bool = True,
) -> RouteCheckpoint:
    """Build a valid checkpoint, overriding only what a test needs."""
    return RouteCheckpoint(
        checkpoint_id=checkpoint_id,
        latitude=39.7392,
        longitude=-104.9903,
        distance_from_origin_miles=distance,
        eta=make_eta(),
        risk=risk,
        weather_available=weather_available,
    )


def make_route(
    *,
    route_id: str = "route-1",
    summary: RouteSummary | None = None,
) -> Route:
    """Build a valid single-checkpoint route."""
    return Route(
        route_id=route_id,
        distance_miles=100.0,
        duration_seconds=7200.0,
        checkpoints=(make_checkpoint(),),
        summary=summary,
    )


def test_valid_checkpoint_construction() -> None:
    """A fully specified checkpoint keeps its risk and availability."""
    assessment = RiskAssessment(
        level=RiskLevel.LOW,
        score=float(RiskLevel.LOW.value),
        reasons=("wind",),
    )
    checkpoint = make_checkpoint(risk=assessment, weather_available=True)

    assert checkpoint.checkpoint_id == "checkpoint-1"
    assert checkpoint.distance_from_origin_miles == 0.0
    assert checkpoint.risk == assessment
    assert checkpoint.weather_available is True


def test_valid_route_construction() -> None:
    """A fully specified route keeps its totals and starts unsummarized."""
    route = make_route()

    assert route.route_id == "route-1"
    assert route.distance_miles == 100.0
    assert route.duration_seconds == 7200.0
    assert len(route.checkpoints) == 1
    assert route.summary is None


def test_checkpoint_accepts_engine_risk_result() -> None:
    """Checkpoints reuse the risk engine result type directly."""
    result = RiskResult(level=RiskLevel.HIGH, reasons=("wind",))
    checkpoint = make_checkpoint(risk=result, weather_available=True)

    assert checkpoint.risk == result


def test_checkpoint_with_weather_but_no_risk_is_allowed() -> None:
    """Classified-later checkpoints are valid; aggregation marks them ineligible."""
    checkpoint = make_checkpoint(risk=None, weather_available=True)

    assert checkpoint.risk is None


def test_risk_assessment_stores_level_score_and_reasons() -> None:
    """Assessments carry level, score, and reasons together."""
    assessment = RiskAssessment(
        level=RiskLevel.HIGH,
        score=RiskLevel.HIGH.value,
        reasons=("Heavy rain",),
    )

    assert assessment.level == RiskLevel.HIGH
    assert assessment.score == 3
    assert assessment.reasons == ("Heavy rain",)


@pytest.mark.parametrize("bad_score", [float("nan"), float("inf"), -1.0, 0.0, 6.0])
def test_risk_assessment_rejects_invalid_scores(bad_score: float) -> None:
    """Non-finite and out-of-range scores cannot enter the domain."""
    with pytest.raises(ValueError, match="risk score"):
        RiskAssessment(level=RiskLevel.LOW, score=bad_score)


def test_risk_assessment_rejects_score_level_mismatch() -> None:
    """Score must equal the level value so miles and average agree."""
    with pytest.raises(ValueError, match="must equal level value"):
        RiskAssessment(level=RiskLevel.LOW, score=5.0)


def test_risk_assessment_rejects_non_risk_level() -> None:
    """Only real RiskLevel members classify risk."""
    with pytest.raises(ValueError, match="RiskLevel"):
        RiskAssessment(level="HIGH", score=3.0)  # type: ignore[arg-type]


def test_checkpoint_requires_timezone_aware_eta() -> None:
    """Naive ETAs are rejected, never silently assumed UTC."""
    with pytest.raises(ValueError, match="timezone-aware"):
        RouteCheckpoint(
            checkpoint_id="checkpoint-1",
            latitude=39.0,
            longitude=-104.0,
            distance_from_origin_miles=0.0,
            eta=datetime(2026, 10, 10, 14, 0),
            weather_available=False,
        )


@pytest.mark.parametrize("bad_id", ["", "   "])
def test_checkpoint_rejects_empty_id(bad_id: str) -> None:
    """Blank checkpoint ids cannot identify a segment."""
    with pytest.raises(ValueError, match="checkpoint_id must not be empty"):
        make_checkpoint(checkpoint_id=bad_id)


@pytest.mark.parametrize("bad_id", ["", "   "])
def test_route_rejects_empty_id(bad_id: str) -> None:
    """Blank route ids cannot identify a candidate."""
    with pytest.raises(ValueError, match="route_id must not be empty"):
        make_route(route_id=bad_id)


def test_checkpoint_rejects_negative_distance() -> None:
    """Cumulative distance cannot run backwards past the origin."""
    with pytest.raises(
        ValueError,
        match="cannot be negative",
    ):
        make_checkpoint(distance=-1.0)


@pytest.mark.parametrize(
    "field",
    ["distance_miles", "duration_seconds"],
)
@pytest.mark.parametrize("bad_value", [float("nan"), float("inf"), -1.0])
def test_route_rejects_non_finite_or_negative_scalars(
    field: str, bad_value: float
) -> None:
    """Route totals must be usable finite numbers."""
    kwargs = {
        "route_id": "route-1",
        "distance_miles": 100.0,
        "duration_seconds": 7200.0,
        "checkpoints": (make_checkpoint(),),
    }
    kwargs[field] = bad_value
    with pytest.raises(ValueError):
        Route(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"distance": float("nan")},
        {"distance": float("inf")},
    ],
)
def test_checkpoint_rejects_non_finite_distance(kwargs: dict) -> None:
    """NaN/inf distances would corrupt segment math."""
    with pytest.raises(ValueError, match="must be finite"):
        make_checkpoint(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize("bad_value", [float("nan"), float("inf")])
def test_checkpoint_rejects_non_finite_coordinates(bad_value: float) -> None:
    """Coordinates must be real numbers."""
    with pytest.raises(ValueError, match="must be finite"):
        RouteCheckpoint(
            checkpoint_id="checkpoint-1",
            latitude=bad_value,
            longitude=-104.0,
            distance_from_origin_miles=0.0,
            eta=make_eta(),
            weather_available=False,
        )


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(91.0, 0.0), (-91.0, 0.0), (0.0, 181.0), (0.0, -181.0)],
)
def test_checkpoint_rejects_out_of_range_coordinates(
    latitude: float, longitude: float
) -> None:
    """Coordinates must lie within WGS84 bounds."""
    with pytest.raises(ValueError, match="latitude|longitude"):
        RouteCheckpoint(
            checkpoint_id="checkpoint-1",
            latitude=latitude,
            longitude=longitude,
            distance_from_origin_miles=0.0,
            eta=make_eta(),
            weather_available=False,
        )


def test_checkpoint_without_weather_cannot_have_risk() -> None:
    """Risk without observations is a contradiction, not Low risk."""
    assessment = RiskAssessment(
        level=RiskLevel.LOW,
        score=RiskLevel.LOW.value,
    )

    with pytest.raises(
        ValueError,
        match="without weather",
    ):
        make_checkpoint(
            risk=assessment,
            weather_available=False,
        )


def test_checkpoint_rejects_unknown_risk_type() -> None:
    """Only engine-compatible risk types attach to checkpoints."""
    with pytest.raises(ValueError, match="RiskAssessment or RiskResult"):
        make_checkpoint(risk="LOW", weather_available=True)  # type: ignore[arg-type]


def test_route_requires_at_least_one_checkpoint() -> None:
    """A route with no checkpoints has no segments to score."""
    with pytest.raises(
        ValueError,
        match="at least one checkpoint",
    ):
        Route(
            route_id="route-1",
            distance_miles=100.0,
            duration_seconds=7200.0,
            checkpoints=(),
        )


def test_route_rejects_non_monotonic_checkpoints() -> None:
    """Decreasing distances would yield negative segments."""
    with pytest.raises(ValueError, match="monotonically increasing"):
        Route(
            route_id="route-1",
            distance_miles=100.0,
            duration_seconds=7200.0,
            checkpoints=(
                make_checkpoint(checkpoint_id="a", distance=20.0),
                make_checkpoint(checkpoint_id="b", distance=10.0),
            ),
        )


def test_route_allows_equal_consecutive_distances() -> None:
    """Zero-length segments are valid and contribute zero miles."""
    route = Route(
        route_id="route-1",
        distance_miles=100.0,
        duration_seconds=7200.0,
        checkpoints=(
            make_checkpoint(checkpoint_id="a", distance=10.0),
            make_checkpoint(checkpoint_id="b", distance=10.0),
        ),
    )

    assert len(route.checkpoints) == 2


@pytest.mark.parametrize(
    "field",
    [
        "severe_miles",
        "high_miles",
        "no_travel_miles",
        "average_risk_score",
        "duration_seconds",
    ],
)
def test_summary_rejects_non_finite_values(field: str) -> None:
    """Summaries must hold usable finite metrics."""
    kwargs = {
        "severe_miles": 0.0,
        "high_miles": 0.0,
        "no_travel_miles": 0.0,
        "average_risk_score": 1.0,
        "duration_seconds": 7200.0,
        "is_eligible": True,
    }
    kwargs[field] = float("nan")
    with pytest.raises(ValueError, match="must be finite"):
        RouteSummary(**kwargs)  # type: ignore[arg-type]


def test_route_with_summary_returns_new_route() -> None:
    """Summarizing copies the frozen route instead of mutating it."""
    route = make_route()

    summary = RouteSummary(
        severe_miles=0.0,
        high_miles=10.0,
        no_travel_miles=0.0,
        average_risk_score=2.0,
        duration_seconds=7200.0,
        is_eligible=True,
    )

    summarized_route = route.with_summary(summary)

    assert summarized_route is not route
    assert summarized_route.route_id == route.route_id
    assert summarized_route.checkpoints == route.checkpoints
    assert summarized_route.summary == summary
    assert route.summary is None


def test_recommendation_result_reports_recommendation() -> None:
    """A selected route id reads as a recommendation."""
    result = RecommendationResult(
        recommended_route_id="route-1",
        ranked_route_ids=("route-1", "route-2"),
        all_routes_ineligible=False,
    )

    assert result.has_recommendation is True


def test_recommendation_result_reports_no_recommendation() -> None:
    """None reads as no recommendation when all routes fail."""
    result = RecommendationResult(
        recommended_route_id=None,
        ranked_route_ids=("route-1",),
        all_routes_ineligible=True,
    )

    assert result.has_recommendation is False
