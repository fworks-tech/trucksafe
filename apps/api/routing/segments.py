"""
Segment-level risk geometry enrichment.

This module enriches route geometry with vertices at checkpoint positions
and builds renderable risk segments for the frontend map.

A segment is the portion of the route between two consecutive checkpoints.
The risk for a segment is determined by the checkpoint at the end of the
segment. This matches the aggregation logic in `aggregation.py`.

The module is framework-independent: no Django, DRF, DB, HTTP, or provider
imports.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from math import isfinite

from risk.schemas import RiskResult

from .checkpoints import (
    _DISTANCE_EPSILON_MILES,
    Coordinate,
    _cumulative_distances,
    _point_at_distance,
)
from .domain import RiskAssessment  # noqa: F401  # re-exported for convenience

MAX_GEOMETRY_POINTS = 50_000
# Sized for real road polylines: OSRM full-overview geometry runs ~10
# points per mile, so a 3,000-mile route plus checkpoint vertices stays
# well under the cap while pathological payloads are still rejected.
MAX_SEGMENTS = 1_000
MAX_REASON_LENGTH = 200


@dataclass(frozen=True, slots=True)
class RouteSegment:
    """A renderable segment of a route with associated risk.

    Attributes:
        start_index: Index into the enriched geometry coordinates array.
        end_index: Index into the enriched geometry coordinates array
            (inclusive). Must be >= start_index.
        risk: Risk assessment for this segment, or None when weather is
            unavailable at the defining checkpoint. Never fabricated as Low.
    """

    start_index: int
    end_index: int
    risk: RiskAssessment | RiskResult | None = None

    def __post_init__(self) -> None:
        if self.start_index < 0:
            raise ValueError(f"start_index must be non-negative: {self.start_index!r}")
        if self.end_index < self.start_index:
            raise ValueError(
                f"end_index {self.end_index!r} must be >= "
                f"start_index {self.start_index!r}"
            )


@dataclass(frozen=True, slots=True)
class EnrichedRouteGeometry:
    """Provider geometry enriched with vertices at checkpoint positions.

    Attributes:
        points: Enriched coordinate tuple (original vertices + checkpoint
            vertices), ordered from origin to destination.
        checkpoint_indices: Index of each checkpoint in `points`.
        segments: Risk segments aligned with checkpoint intervals, ordered
            from origin to destination. Empty when no usable risk data.
    """

    points: tuple[Coordinate, ...]
    checkpoint_indices: tuple[int, ...]
    segments: tuple[RouteSegment, ...]


def enrich_geometry(
    coordinates: Sequence[Coordinate],
    checkpoint_distances: Sequence[float],
) -> tuple[tuple[Coordinate, ...], tuple[int, ...]]:
    """Insert vertices at checkpoint positions along the route geometry.

    Produces an enriched polyline where each checkpoint corresponds to
    exactly one vertex. The frontend can slice this geometry by the
    returned checkpoint indices to obtain sub-lines for each risk segment.

    Args:
        coordinates: Original route geometry (>= 2 points).
        checkpoint_distances: Cumulative checkpoint distances in miles
            (>= 2 values, monotonically non-decreasing, first is 0.0,
            last equals total route distance).

    Returns:
        A tuple of (enriched_points, checkpoint_indices) where
        checkpoint_indices[i] is the index of checkpoint i in
        enriched_points.

    Raises:
        ValueError: If inputs are invalid or limits are exceeded.
    """
    if len(coordinates) < 2:
        raise ValueError("coordinates must contain at least two vertices")
    if len(checkpoint_distances) < 2:
        raise ValueError("at least two checkpoint distances are required")
    if len(coordinates) > MAX_GEOMETRY_POINTS:
        raise ValueError(
            f"geometry exceeds maximum of {MAX_GEOMETRY_POINTS} points: "
            f"{len(coordinates)}"
        )

    cumulative = _cumulative_distances(coordinates)
    total_distance = cumulative[-1]

    _validate_checkpoint_distances(checkpoint_distances, total_distance)

    enriched: list[Coordinate] = []
    checkpoint_indices: list[int] = []
    orig_idx = 0

    for cp_distance in checkpoint_distances:
        while (
            orig_idx < len(coordinates)
            and cumulative[orig_idx] < cp_distance - _DISTANCE_EPSILON_MILES
        ):
            enriched.append(coordinates[orig_idx])
            orig_idx += 1

        if (
            orig_idx < len(coordinates)
            and abs(cumulative[orig_idx] - cp_distance) <= _DISTANCE_EPSILON_MILES
        ):
            enriched.append(coordinates[orig_idx])
            checkpoint_indices.append(len(enriched) - 1)
            orig_idx += 1
        else:
            cp_coord = _point_at_distance(coordinates, cumulative, cp_distance)
            enriched.append(cp_coord)
            checkpoint_indices.append(len(enriched) - 1)

    while orig_idx < len(coordinates):
        enriched.append(coordinates[orig_idx])
        orig_idx += 1

    return tuple(enriched), tuple(checkpoint_indices)


def build_segments(
    checkpoint_indices: Sequence[int],
    checkpoint_risks: Sequence[RiskAssessment | RiskResult | None],
    num_geometry_points: int,
) -> tuple[RouteSegment, ...] | None:
    """Build risk segments from checkpoint indices and risks.

    Each segment spans from checkpoint i-1 to checkpoint i and carries
    the risk of checkpoint i (the checkpoint at the end of the segment).
    Zero-length segments (where start_index == end_index) are omitted.

    Validation is all-or-nothing: if any segment fails validation, the
    entire result is None and the caller should fall back to route-level
    coloring.

    Args:
        checkpoint_indices: Index of each checkpoint in the enriched geometry.
        checkpoint_risks: Risk for each checkpoint (None when unavailable).
        num_geometry_points: Total number of points in the enriched geometry.

    Returns:
        Tuple of segments ordered from origin to destination, or None if
        any segment is invalid.
    """
    if len(checkpoint_indices) != len(checkpoint_risks):
        return None
    if len(checkpoint_indices) < 2:
        return None
    if len(checkpoint_indices) - 1 > MAX_SEGMENTS:
        return None

    segments: list[RouteSegment] = []
    prev_end = 0

    for i in range(1, len(checkpoint_indices)):
        start_idx = checkpoint_indices[i - 1]
        end_idx = checkpoint_indices[i]
        risk = checkpoint_risks[i]

        if start_idx < 0 or end_idx >= num_geometry_points:
            return None
        if end_idx < start_idx:
            return None
        if start_idx != prev_end:
            return None

        if risk is not None and not isinstance(risk, (RiskAssessment, RiskResult)):
            return None

        if risk is not None:
            reasons = risk.reasons
            if len(reasons) > MAX_SEGMENTS:
                return None
            for reason in reasons:
                if len(reason) > MAX_REASON_LENGTH:
                    return None

        prev_end = end_idx

        if start_idx == end_idx:
            continue

        segments.append(
            RouteSegment(start_index=start_idx, end_index=end_idx, risk=risk)
        )

    if not segments:
        return None

    if segments[-1].end_index != num_geometry_points - 1:
        return None

    return tuple(segments)


def _validate_checkpoint_distances(
    checkpoint_distances: Sequence[float],
    total_distance: float,
) -> None:
    """Validate checkpoint distances are finite, ordered, and within bounds."""
    for i, distance in enumerate(checkpoint_distances):
        if not isfinite(distance):
            raise ValueError(f"checkpoint distance must be finite: {distance!r}")
        if distance < 0:
            raise ValueError(f"checkpoint distance cannot be negative: {distance!r}")
        if i > 0 and distance < checkpoint_distances[i - 1]:
            raise ValueError(
                "checkpoint distances must be monotonically non-decreasing"
            )
        if distance > total_distance + _DISTANCE_EPSILON_MILES:
            raise ValueError(
                f"checkpoint distance {distance!r} exceeds route distance "
                f"{total_distance!r}"
            )


__all__ = [
    "MAX_GEOMETRY_POINTS",
    "MAX_REASON_LENGTH",
    "MAX_SEGMENTS",
    "EnrichedRouteGeometry",
    "RouteSegment",
    "build_segments",
    "enrich_geometry",
]
