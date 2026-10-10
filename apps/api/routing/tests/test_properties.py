"""
Property-based tests for checkpoint generation.

These tests verify the invariants that hold for every valid route, not just
the hand-picked cases in test_checkpoints.py: ordering, destination
inclusion, and ETAs that never move backwards.

Execution settings are centralized in apps/api/conftest.py so every
property test runs deterministically under the same profile.
"""

import math
from datetime import UTC, datetime, timedelta

from hypothesis import given
from hypothesis import strategies as st

from routing.checkpoints import Checkpoint, Coordinate, generate_checkpoints

DEPARTURE_UTC = datetime(2026, 10, 9, 14, 0, tzinfo=UTC)

ROUTE_LENGTH_MILES = st.floats(
    min_value=1.0,
    max_value=5000.0,
    allow_nan=False,
    allow_infinity=False,
)
INTERVAL_MILES = st.sampled_from([10.0, 25.0, 50.0])
DURATION_SECONDS = st.floats(
    min_value=60.0,
    max_value=200_000.0,
    allow_nan=False,
    allow_infinity=False,
)
DEPARTURE_OFFSET_MINUTES = st.integers(min_value=-720, max_value=720)

MILES_PER_DEGREE_LONGITUDE = math.radians(1.0) * 3958.7613


def equator_route(distance_miles: float, step_miles: float) -> list[Coordinate]:
    """
    Build a straight route along the equator with segments of step_miles.
    """
    coordinates: list[Coordinate] = []
    distance = 0.0
    while distance < distance_miles:
        coordinates.append(Coordinate(0.0, distance / MILES_PER_DEGREE_LONGITUDE))
        distance += step_miles
    coordinates.append(Coordinate(0.0, distance_miles / MILES_PER_DEGREE_LONGITUDE))
    return coordinates


@given(
    total_distance=ROUTE_LENGTH_MILES,
    interval_miles=INTERVAL_MILES,
    duration_seconds=DURATION_SECONDS,
    offset_minutes=DEPARTURE_OFFSET_MINUTES,
)
def test_checkpoint_invariants_hold_for_every_route(
    total_distance: float,
    interval_miles: float,
    duration_seconds: float,
    offset_minutes: int,
) -> None:
    """
    For every route, checkpoints stay ordered, include the destination, and
    never produce an ETA that moves backwards or leaves UTC.
    """
    departure_at = DEPARTURE_UTC + timedelta(minutes=offset_minutes)
    route = equator_route(
        total_distance,
        step_miles=min(interval_miles, total_distance / 2),
    )

    checkpoints: list[Checkpoint] = generate_checkpoints(
        route,
        interval_miles=interval_miles,
        departure_at=departure_at,
        duration_seconds=duration_seconds,
    )

    distances = [checkpoint.distance_miles for checkpoint in checkpoints]
    etas = [checkpoint.eta for checkpoint in checkpoints]

    assert [checkpoint.sequence for checkpoint in checkpoints] == list(
        range(1, len(checkpoints) + 1)
    )
    assert distances == sorted(distances)
    assert etas == sorted(etas)
    assert all(checkpoint.eta.utcoffset() == timedelta(0) for checkpoint in checkpoints)

    assert distances[0] == 0.0
    assert math.isclose(
        distances[-1],
        total_distance,
        rel_tol=1e-06,
        abs_tol=1e-06,
    )

    assert checkpoints[0].eta == departure_at
