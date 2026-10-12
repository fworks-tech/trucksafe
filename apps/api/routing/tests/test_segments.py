"""Tests for segment-level risk geometry enrichment."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from risk.engine import calculate_risk
from risk.schemas import RiskLevel, RiskResult, WeatherObservation
from routing.checkpoints import (
    Coordinate,
    _cumulative_distances,
    generate_checkpoints,
)
from routing.segments import (
    MAX_GEOMETRY_POINTS,
    RouteSegment,
    build_segments,
    enrich_geometry,
)

ORIGIN = Coordinate(latitude=41.88, longitude=-87.63)
DEST = Coordinate(latitude=32.78, longitude=-96.80)


def _make_geometry(points: int = 5) -> list[Coordinate]:
    coords = []
    for i in range(points):
        ratio = i / (points - 1)
        lat = ORIGIN.latitude + ratio * (DEST.latitude - ORIGIN.latitude)
        lon = ORIGIN.longitude + ratio * (DEST.longitude - ORIGIN.longitude)
        coords.append(Coordinate(latitude=lat, longitude=lon))
    return coords


def _make_checkpoints(
    coords: list[Coordinate],
    interval: float = 25.0,
    duration: float = 3600.0,
) -> list:
    departure = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    return generate_checkpoints(coords, interval, departure, duration)


def _make_risks(count: int, level: RiskLevel = RiskLevel.LOW) -> list[RiskResult]:
    return [RiskResult(level=level, reasons=("wind",)) for _ in range(count)]


def _enriched(
    coords: list[Coordinate],
    checkpoints: list,
) -> tuple[tuple[Coordinate, ...], tuple[int, ...]]:
    return enrich_geometry(coords, [cp.distance_miles for cp in checkpoints])


class TestEnrichGeometry:
    def test_inserts_vertices_at_checkpoint_positions(self) -> None:
        coords = _make_geometry(5)
        checkpoints = _make_checkpoints(coords)

        enriched, indices = _enriched(coords, checkpoints)

        assert len(enriched) >= len(coords)
        assert len(indices) == len(checkpoints)
        assert indices[0] == 0
        assert indices[-1] == len(enriched) - 1

    def test_preserves_original_endpoints(self) -> None:
        coords = _make_geometry(5)
        checkpoints = _make_checkpoints(coords)

        enriched, _ = _enriched(coords, checkpoints)

        assert enriched[0] == coords[0]
        assert enriched[-1] == coords[-1]

    def test_checkpoint_at_existing_vertex_no_duplicate(self) -> None:
        coords = [
            Coordinate(latitude=0.0, longitude=0.0),
            Coordinate(latitude=0.0, longitude=1.0),
            Coordinate(latitude=0.0, longitude=2.0),
        ]
        cp_distances = [0.0, 0.5, 1.0, 2.0]

        enriched, indices = enrich_geometry(coords, cp_distances)

        assert len(indices) == 4
        assert indices[0] == 0
        assert enriched[indices[0]] == coords[0]

    def test_raises_on_too_few_geometry_points(self) -> None:
        with pytest.raises(ValueError, match="at least two vertices"):
            enrich_geometry([ORIGIN], [0.0, 1.0])

    def test_raises_on_too_few_checkpoints(self) -> None:
        coords = _make_geometry(5)
        with pytest.raises(ValueError, match="at least two checkpoint"):
            enrich_geometry(coords, [0.0])

    def test_raises_on_unordered_checkpoint_distances(self) -> None:
        coords = _make_geometry(5)
        with pytest.raises(ValueError, match="monotonically non-decreasing"):
            enrich_geometry(coords, [0.0, 50.0, 25.0, 100.0])

    def test_raises_on_distance_exceeding_route(self) -> None:
        coords = _make_geometry(5)
        with pytest.raises(ValueError, match="exceeds route distance"):
            enrich_geometry(coords, [0.0, 9999.0])

    def test_raises_on_nan_checkpoint_distance(self) -> None:
        coords = _make_geometry(5)
        with pytest.raises(ValueError, match="must be finite"):
            enrich_geometry(coords, [0.0, float("nan"), 100.0])

    def test_raises_on_exceeding_max_geometry_points(self) -> None:
        coords = [
            Coordinate(latitude=0.0, longitude=float(i))
            for i in range(MAX_GEOMETRY_POINTS + 1)
        ]
        with pytest.raises(ValueError, match="exceeds maximum"):
            enrich_geometry(coords, [0.0, 1.0])


class TestBuildSegments:
    def test_builds_correct_number_of_segments(self) -> None:
        coords = _make_geometry(5)
        checkpoints = _make_checkpoints(coords)
        enriched, indices = _enriched(coords, checkpoints)
        risks = _make_risks(len(checkpoints))

        segments = build_segments(indices, risks, len(enriched))

        assert segments is not None
        assert len(segments) == len(checkpoints) - 1

    def test_segments_are_contiguous(self) -> None:
        coords = _make_geometry(5)
        checkpoints = _make_checkpoints(coords)
        enriched, indices = _enriched(coords, checkpoints)
        risks = _make_risks(len(checkpoints))

        segments = build_segments(indices, risks, len(enriched))

        assert segments is not None
        for i in range(1, len(segments)):
            assert segments[i].start_index == segments[i - 1].end_index

    def test_last_segment_ends_at_geometry_end(self) -> None:
        coords = _make_geometry(5)
        checkpoints = _make_checkpoints(coords)
        enriched, indices = _enriched(coords, checkpoints)
        risks = _make_risks(len(checkpoints))

        segments = build_segments(indices, risks, len(enriched))

        assert segments is not None
        assert segments[-1].end_index == len(enriched) - 1

    def test_segment_risk_matches_checkpoint_risk(self) -> None:
        coords = _make_geometry(5)
        checkpoints = _make_checkpoints(coords)
        enriched, indices = _enriched(coords, checkpoints)

        weather = WeatherObservation(
            wind_mph=40.0, rain_inches_per_hour=0.0, snow_inches_per_hour=0.0
        )
        risks = [None] + [
            calculate_risk(weather, 20_000) for _ in range(len(checkpoints) - 1)
        ]

        segments = build_segments(indices, risks, len(enriched))

        assert segments is not None
        for i, segment in enumerate(segments):
            assert segment.risk is risks[i + 1]

    def test_returns_none_on_index_out_of_bounds(self) -> None:
        indices = [0, 5]
        risks = _make_risks(2)

        result = build_segments(indices, risks, num_geometry_points=3)

        assert result is None

    def test_returns_none_on_non_contiguous_segments(self) -> None:
        indices = [0, 2, 3]
        risks = _make_risks(3)

        result = build_segments(indices, risks, num_geometry_points=10)

        assert result is None

    def test_returns_none_on_mismatched_lengths(self) -> None:
        result = build_segments([0, 1, 2], _make_risks(2), num_geometry_points=5)

        assert result is None

    def test_returns_none_on_invalid_risk_type(self) -> None:
        result = build_segments([0, 1], [None, "invalid"], num_geometry_points=5)  # type: ignore[list-item]

        assert result is None

    def test_skips_zero_length_segments(self) -> None:
        risks = _make_risks(4)
        segments = build_segments([0, 1, 1, 2], risks, num_geometry_points=3)

        assert segments is not None
        assert len(segments) == 2
        assert segments[0].start_index == 0
        assert segments[0].end_index == 1
        assert segments[1].start_index == 1
        assert segments[1].end_index == 2

    def test_checkpoint_coinciding_with_vertex_produces_no_duplicate(self) -> None:
        coords = [
            Coordinate(latitude=0.0, longitude=0.0),
            Coordinate(latitude=0.0, longitude=0.01),
            Coordinate(latitude=0.0, longitude=0.02),
        ]
        cumulative = _cumulative_distances(coords)
        cp_distances = [0.0, cumulative[1], cumulative[2]]

        enriched, indices = enrich_geometry(coords, cp_distances)
        risks = _make_risks(len(cp_distances))

        segments = build_segments(indices, risks, len(enriched))

        assert len(enriched) == 3
        assert indices == (0, 1, 2)
        assert segments is not None
        assert len(segments) == 2
        for segment in segments:
            assert segment.end_index > segment.start_index

    def test_returns_none_when_no_valid_segments(self) -> None:
        result = build_segments([0, 0], _make_risks(2), num_geometry_points=5)

        assert result is None

    def test_returns_none_when_last_segment_does_not_reach_end(self) -> None:
        result = build_segments([0, 1, 2], _make_risks(3), num_geometry_points=10)

        assert result is None


class TestRouteSegmentValidation:
    def test_valid_segment(self) -> None:
        segment = RouteSegment(start_index=0, end_index=2, risk=None)
        assert segment.start_index == 0
        assert segment.end_index == 2
        assert segment.risk is None

    def test_rejects_negative_start_index(self) -> None:
        with pytest.raises(ValueError, match="start_index must be non-negative"):
            RouteSegment(start_index=-1, end_index=2)

    def test_rejects_end_before_start(self) -> None:
        with pytest.raises(ValueError, match="must be >= start_index"):
            RouteSegment(start_index=3, end_index=1)
