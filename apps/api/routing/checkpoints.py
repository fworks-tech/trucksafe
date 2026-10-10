"""
Checkpoint generation and estimated arrival time calculation.

This module contains the domain operation that samples checkpoints along a
route geometry and assigns each checkpoint an estimated arrival time.

The generation follows these steps:

1. Measure cumulative distance along the route geometry.
2. Place checkpoints at the selected interval.
3. Always include the origin and destination checkpoints.
4. Interpolate the checkpoint coordinate along the route.
5. Calculate the ETA from cumulative distance and total duration.

The module does not perform HTTP requests, database access, logging, or
framework-specific operations. Route geometry is provided by a routing
provider adapter and normalized before it reaches this module.
"""

from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import asin, cos, isfinite, radians, sin, sqrt
from typing import Final

CHECKPOINT_INTERVALS_MILES: Final[tuple[float, ...]] = (10.0, 25.0, 50.0)

EARTH_RADIUS_MILES: Final[float] = 3958.7613

_DISTANCE_EPSILON_MILES: Final[float] = 1e-6


@dataclass(frozen=True, slots=True)
class Coordinate:
    """
    A WGS84 coordinate.

    Attributes:
        latitude: Latitude in decimal degrees, from -90 to 90.
        longitude: Longitude in decimal degrees, from -180 to 180.
    """

    latitude: float
    longitude: float


@dataclass(frozen=True, slots=True)
class Checkpoint:
    """
    A single weather sampling point along a route.

    Attributes:
        sequence: One-based order of the checkpoint along the route.
        distance_miles: Cumulative distance from the origin in miles.
        latitude: Checkpoint latitude in decimal degrees.
        longitude: Checkpoint longitude in decimal degrees.
        eta: Estimated arrival time as an aware UTC datetime.
    """

    sequence: int
    distance_miles: float
    latitude: float
    longitude: float
    eta: datetime


def _validate_coordinate(coordinate: Coordinate) -> None:
    """
    Validate a WGS84 coordinate.

    Args:
        coordinate: Coordinate to validate.

    Raises:
        ValueError: If latitude or longitude is not finite or out of range.
    """
    if not isfinite(coordinate.latitude) or not isfinite(coordinate.longitude):
        raise ValueError("coordinate values must be finite.")

    if not -90.0 <= coordinate.latitude <= 90.0:
        raise ValueError("latitude must be between -90 and 90 degrees.")

    if not -180.0 <= coordinate.longitude <= 180.0:
        raise ValueError("longitude must be between -180 and 180 degrees.")


def _validate_interval(interval_miles: float) -> None:
    """
    Validate the checkpoint interval.

    Args:
        interval_miles: Checkpoint interval in miles.

    Raises:
        ValueError: If the interval is not one of the supported values.
    """
    if not isfinite(interval_miles):
        raise ValueError("interval_miles must be finite.")

    if interval_miles not in CHECKPOINT_INTERVALS_MILES:
        raise ValueError("interval_miles must be one of 10, 25, or 50.")


def _validate_duration(duration_seconds: float) -> None:
    """
    Validate the total route duration.

    Args:
        duration_seconds: Route duration in seconds.

    Raises:
        ValueError: If the duration is not a positive finite number.
    """
    if not isfinite(duration_seconds):
        raise ValueError("duration_seconds must be finite.")

    if duration_seconds <= 0:
        raise ValueError("duration_seconds must be greater than zero.")


def _validate_departure(departure_at: datetime) -> None:
    """
    Validate the departure timestamp.

    Args:
        departure_at: Departure timestamp.

    Raises:
        ValueError: If the timestamp is not timezone-aware.
    """
    if not isinstance(departure_at, datetime):
        raise ValueError("departure_at must be a datetime.")

    if departure_at.tzinfo is None:
        raise ValueError("departure_at must be timezone-aware (UTC).")


def _haversine_miles(start: Coordinate, end: Coordinate) -> float:
    """
    Return the great-circle distance between two coordinates in miles.

    Args:
        start: First coordinate.
        end: Second coordinate.

    Returns:
        Distance in miles.
    """
    start_lat = radians(start.latitude)
    end_lat = radians(end.latitude)
    delta_lat = end_lat - start_lat
    delta_lon = radians(end.longitude - start.longitude)

    haversine = (
        sin(delta_lat / 2) ** 2
        + cos(start_lat) * cos(end_lat) * sin(delta_lon / 2) ** 2
    )

    return 2 * EARTH_RADIUS_MILES * asin(sqrt(haversine))


def _cumulative_distances(coordinates: Sequence[Coordinate]) -> list[float]:
    """
    Return cumulative distance in miles at every route vertex.

    Args:
        coordinates: Ordered route geometry.

    Returns:
        A list where each item is the distance from the origin to that
        vertex. The first item is always zero.
    """
    cumulative = [0.0]

    for previous, current in zip(coordinates, coordinates[1:], strict=False):
        cumulative.append(cumulative[-1] + _haversine_miles(previous, current))

    return cumulative


def _point_at_distance(
    coordinates: Sequence[Coordinate],
    cumulative: Sequence[float],
    distance_miles: float,
) -> Coordinate:
    """
    Return the coordinate at a given cumulative distance.

    Distances between route vertices are interpolated linearly in latitude
    and longitude.

    Args:
        coordinates: Ordered route geometry.
        cumulative: Cumulative distance at every vertex.
        distance_miles: Target distance along the route.

    Returns:
        The interpolated coordinate.
    """
    if distance_miles <= 0.0:
        return coordinates[0]

    if distance_miles >= cumulative[-1]:
        return coordinates[-1]

    # cumulative[-1] is greater than the target, so the index after the
    # match always exists and is strictly greater than the matched index.
    index = bisect_right(cumulative, distance_miles) - 1
    start_distance = cumulative[index]
    end_distance = cumulative[index + 1]

    start = coordinates[index]
    end = coordinates[index + 1]
    ratio = (distance_miles - start_distance) / (end_distance - start_distance)

    return Coordinate(
        latitude=start.latitude + ratio * (end.latitude - start.latitude),
        longitude=start.longitude + ratio * (end.longitude - start.longitude),
    )


def generate_checkpoints(
    coordinates: Sequence[Coordinate],
    interval_miles: float,
    departure_at: datetime,
    duration_seconds: float,
) -> list[Checkpoint]:
    """
    Sample checkpoints along a route and calculate their ETAs.

    The origin is always the first checkpoint and the destination is always
    the final checkpoint, even when the route length is not an exact
    multiple of the interval.

    Args:
        coordinates: Ordered route geometry with at least two vertices.
        interval_miles: Checkpoint interval, one of 10, 25, or 50 miles.
        departure_at: Timezone-aware departure timestamp.
        duration_seconds: Total route duration in seconds.

    Returns:
        Checkpoints ordered by distance, including origin and destination.

    Raises:
        ValueError: If any input is invalid or the route has no length.
    """
    _validate_interval(interval_miles)
    _validate_duration(duration_seconds)
    _validate_departure(departure_at)

    departure_utc = departure_at.astimezone(UTC)

    if len(coordinates) < 2:
        raise ValueError("coordinates must contain at least two vertices.")

    for coordinate in coordinates:
        _validate_coordinate(coordinate)

    cumulative = _cumulative_distances(coordinates)
    total_distance = cumulative[-1]

    if total_distance <= 0.0:
        raise ValueError("route distance must be greater than zero.")

    # The epsilon keeps a destination that lands within floating point noise
    # of an interval boundary from producing a duplicate checkpoint.
    distances = [0.0]
    interval_distance = interval_miles
    while interval_distance < total_distance - _DISTANCE_EPSILON_MILES:
        distances.append(interval_distance)
        interval_distance += interval_miles

    distances.append(total_distance)

    checkpoints: list[Checkpoint] = []

    for sequence, distance_miles in enumerate(distances, start=1):
        coordinate = _point_at_distance(coordinates, cumulative, distance_miles)
        eta = departure_utc + timedelta(
            seconds=(distance_miles / total_distance) * duration_seconds
        )
        checkpoints.append(
            Checkpoint(
                sequence=sequence,
                distance_miles=distance_miles,
                latitude=coordinate.latitude,
                longitude=coordinate.longitude,
                eta=eta,
            )
        )

    return checkpoints
