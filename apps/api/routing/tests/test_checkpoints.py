"""
Unit tests for checkpoint generation and ETA calculation.

The tests focus on exact interval boundaries, mandatory origin and
destination checkpoints, and the cumulative-distance ETA formula because
an off-by-one in checkpoint placement would change which weather data is
sampled along the route.
"""

import math
from datetime import UTC, datetime, timedelta

import pytest

from routing.checkpoints import (
    EARTH_RADIUS_MILES,
    Coordinate,
    generate_checkpoints,
)

DEPARTURE = datetime(2026, 10, 9, 14, 0, tzinfo=UTC)

MILES_PER_DEGREE_LONGITUDE = math.radians(1.0) * EARTH_RADIUS_MILES


def equator_route(distance_miles: float, step_miles: float) -> list[Coordinate]:
    """
    Build a straight route along the equator with segments of step_miles.

    Route length along the equator is exact under the haversine formula,
    which makes the expected checkpoint distances deterministic.
    """
    coordinates: list[Coordinate] = []
    distance = 0.0
    while distance < distance_miles:
        coordinates.append(Coordinate(0.0, distance / MILES_PER_DEGREE_LONGITUDE))
        distance += step_miles
    coordinates.append(Coordinate(0.0, distance_miles / MILES_PER_DEGREE_LONGITUDE))
    return coordinates


def test_exact_interval_multiples_include_each_boundary() -> None:
    """
    A route that is an exact multiple of the interval must place a
    checkpoint at every interval boundary without duplicating the
    destination.
    """
    checkpoints = generate_checkpoints(
        equator_route(100.0, step_miles=25.0),
        interval_miles=25.0,
        departure_at=DEPARTURE,
        duration_seconds=7200.0,
    )

    assert [checkpoint.sequence for checkpoint in checkpoints] == [1, 2, 3, 4, 5]
    assert [round(checkpoint.distance_miles, 6) for checkpoint in checkpoints] == [
        0.0,
        25.0,
        50.0,
        75.0,
        100.0,
    ]


def test_interval_10_produces_checkpoint_every_ten_miles() -> None:
    """
    A 100-mile route with a 10-mile interval produces 11 checkpoints.
    """
    checkpoints = generate_checkpoints(
        equator_route(100.0, step_miles=10.0),
        interval_miles=10.0,
        departure_at=DEPARTURE,
        duration_seconds=3600.0,
    )

    assert len(checkpoints) == 11
    assert math.isclose(checkpoints[-1].distance_miles, 100.0, abs_tol=1e-6)


def test_interval_50_produces_checkpoint_every_fifty_miles() -> None:
    """
    A 100-mile route with a 50-mile interval produces 3 checkpoints.
    """
    checkpoints = generate_checkpoints(
        equator_route(100.0, step_miles=25.0),
        interval_miles=50.0,
        departure_at=DEPARTURE,
        duration_seconds=3600.0,
    )

    assert [round(checkpoint.distance_miles, 6) for checkpoint in checkpoints] == [
        0.0,
        50.0,
        100.0,
    ]


def test_destination_included_when_not_on_interval() -> None:
    """
    The destination must be appended even when the route length is not a
    multiple of the interval.
    """
    checkpoints = generate_checkpoints(
        equator_route(60.0, step_miles=30.0),
        interval_miles=25.0,
        departure_at=DEPARTURE,
        duration_seconds=3600.0,
    )

    assert [round(checkpoint.distance_miles, 6) for checkpoint in checkpoints] == [
        0.0,
        25.0,
        50.0,
        60.0,
    ]
    assert math.isclose(checkpoints[-1].distance_miles, 60.0, abs_tol=1e-6)


def test_origin_is_first_checkpoint_at_zero_distance() -> None:
    """
    The first checkpoint is the route origin with zero distance and the
    departure time as its ETA.
    """
    route = equator_route(50.0, step_miles=25.0)
    checkpoints = generate_checkpoints(
        route,
        interval_miles=25.0,
        departure_at=DEPARTURE,
        duration_seconds=3600.0,
    )

    first = checkpoints[0]
    assert first.sequence == 1
    assert first.distance_miles == 0.0
    assert first.latitude == route[0].latitude
    assert first.longitude == route[0].longitude
    assert first.eta == DEPARTURE


def test_destination_is_final_checkpoint_with_full_duration_eta() -> None:
    """
    The final checkpoint is the route destination and its ETA equals the
    departure time plus the full route duration.
    """
    route = equator_route(125.0, step_miles=25.0)
    checkpoints = generate_checkpoints(
        route,
        interval_miles=25.0,
        departure_at=DEPARTURE,
        duration_seconds=3600.0,
    )

    last = checkpoints[-1]
    assert math.isclose(last.distance_miles, 125.0, abs_tol=1e-6)
    assert last.latitude == route[-1].latitude
    assert last.longitude == route[-1].longitude
    assert last.eta == DEPARTURE + timedelta(seconds=3600.0)


def test_checkpoints_are_ordered_and_etas_non_decreasing() -> None:
    """
    Checkpoints are ordered by distance, sequences are contiguous, and
    ETAs never move backwards.
    """
    checkpoints = generate_checkpoints(
        equator_route(604.0, step_miles=25.0),
        interval_miles=25.0,
        departure_at=DEPARTURE,
        duration_seconds=32400.0,
    )

    distances = [checkpoint.distance_miles for checkpoint in checkpoints]
    etas = [checkpoint.eta for checkpoint in checkpoints]

    assert distances == sorted(distances)
    assert etas == sorted(etas)
    assert [checkpoint.sequence for checkpoint in checkpoints] == list(
        range(1, len(checkpoints) + 1)
    )


def test_eta_matches_cumulative_distance_formula() -> None:
    """
    Each ETA equals departure + (distance / total_distance) * duration.
    """
    checkpoints = generate_checkpoints(
        equator_route(100.0, step_miles=25.0),
        interval_miles=25.0,
        departure_at=DEPARTURE,
        duration_seconds=7200.0,
    )

    total_distance = checkpoints[-1].distance_miles
    for checkpoint in checkpoints:
        expected = DEPARTURE + timedelta(
            seconds=(checkpoint.distance_miles / total_distance) * 7200.0
        )
        assert abs((checkpoint.eta - expected).total_seconds()) < 1e-6


def test_checkpoint_coordinate_is_interpolated_along_route() -> None:
    """
    A checkpoint 25 miles along a straight route is placed at the correct
    interpolated coordinate, not at the previous or next route vertex.
    """
    checkpoints = generate_checkpoints(
        equator_route(100.0, step_miles=25.0),
        interval_miles=25.0,
        departure_at=DEPARTURE,
        duration_seconds=3600.0,
    )

    checkpoint = checkpoints[1]
    assert math.isclose(checkpoint.latitude, 0.0, abs_tol=1e-9)
    assert math.isclose(
        checkpoint.longitude,
        25.0 / MILES_PER_DEGREE_LONGITUDE,
        abs_tol=1e-6,
    )


@pytest.mark.parametrize(
    "interval_miles",
    [15.0, 0.0, -10.0, float("nan"), float("inf")],
)
def test_invalid_interval_is_rejected(interval_miles: float) -> None:
    """
    Only the assessment intervals 10, 25, and 50 miles are accepted.
    """
    with pytest.raises(ValueError):
        generate_checkpoints(
            equator_route(100.0, step_miles=25.0),
            interval_miles=interval_miles,
            departure_at=DEPARTURE,
            duration_seconds=3600.0,
        )


@pytest.mark.parametrize(
    "duration_seconds",
    [0.0, -1.0, float("nan"), float("inf")],
)
def test_non_positive_or_non_finite_duration_is_rejected(
    duration_seconds: float,
) -> None:
    """
    A route duration must be a positive finite number of seconds.
    """
    with pytest.raises(ValueError):
        generate_checkpoints(
            equator_route(100.0, step_miles=25.0),
            interval_miles=25.0,
            departure_at=DEPARTURE,
            duration_seconds=duration_seconds,
        )


def test_naive_departure_is_rejected() -> None:
    """
    Timestamps must be timezone-aware so ETAs stay in UTC.
    """
    with pytest.raises(ValueError, match="timezone-aware"):
        generate_checkpoints(
            equator_route(50.0, step_miles=25.0),
            interval_miles=25.0,
            departure_at=datetime(2026, 10, 9, 14, 0),
            duration_seconds=3600.0,
        )


@pytest.mark.parametrize(
    "coordinate",
    [
        Coordinate(91.0, 0.0),
        Coordinate(-91.0, 0.0),
        Coordinate(0.0, 181.0),
        Coordinate(0.0, -181.0),
        Coordinate(float("nan"), 0.0),
        Coordinate(0.0, float("inf")),
    ],
)
def test_invalid_coordinate_is_rejected(coordinate: Coordinate) -> None:
    """
    Latitude, longitude, and finiteness are validated at the boundary.
    """
    with pytest.raises(ValueError):
        generate_checkpoints(
            [Coordinate(0.0, 0.0), coordinate],
            interval_miles=25.0,
            departure_at=DEPARTURE,
            duration_seconds=3600.0,
        )


def test_route_with_fewer_than_two_coordinates_is_rejected() -> None:
    """
    A route needs at least an origin and a destination.
    """
    with pytest.raises(ValueError):
        generate_checkpoints(
            [],
            interval_miles=25.0,
            departure_at=DEPARTURE,
            duration_seconds=3600.0,
        )


def test_zero_length_route_is_rejected() -> None:
    """
    A route whose origin equals its destination has no sampleable distance.
    """
    with pytest.raises(ValueError):
        generate_checkpoints(
            [Coordinate(0.0, 0.0), Coordinate(0.0, 0.0)],
            interval_miles=25.0,
            departure_at=DEPARTURE,
            duration_seconds=3600.0,
        )
