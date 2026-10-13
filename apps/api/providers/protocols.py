"""Adapter contracts for external routing and weather providers.

Concrete adapters (mock or real) implement these protocols. Only normalized
domain types cross the boundary: WGS84 coordinates, canonical units, and
UTC datetimes. No provider-specific formats may leak into the domain.
"""

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Protocol, runtime_checkable

from risk.schemas import WeatherObservation
from routing.checkpoints import Coordinate


@dataclass(frozen=True, slots=True)
class RouteGeometry:
    """Normalized route shape from a routing provider.

    Attributes:
        points: Route polyline from origin to destination in order.
        distance_miles: Total route length in miles.
        duration_seconds: Estimated travel time in seconds.
    """

    points: tuple[Coordinate, ...]
    distance_miles: float
    duration_seconds: float

    def __post_init__(self) -> None:
        """Require a usable polyline with finite positive totals."""
        if len(self.points) < 2:
            raise ValueError("route geometry needs at least origin and destination")
        for point in self.points:
            _validate_coordinate("route point", point)
        for name, value in (
            ("distance_miles", self.distance_miles),
            ("duration_seconds", self.duration_seconds),
        ):
            if not isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive: {value!r}")


def _validate_coordinate(name: str, coordinate: Coordinate) -> None:
    """Reject non-finite or out-of-range WGS84 endpoint coordinates."""
    for axis, minimum, maximum in (
        ("latitude", -90.0, 90.0),
        ("longitude", -180.0, 180.0),
    ):
        value = getattr(coordinate, axis)
        if not isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(
                f"{name} {axis} must be within {minimum} to {maximum}: {value!r}"
            )


@dataclass(frozen=True, slots=True)
class RoutePlanRequest:
    """Normalized input for route planning.

    Attributes:
        origin: Trip start in WGS84 coordinates.
        destination: Trip end in WGS84 coordinates.
        departure: Timezone-aware planned departure time.
    """

    origin: Coordinate
    destination: Coordinate
    departure: datetime

    def __post_init__(self) -> None:
        """Require valid WGS84 endpoints and a timezone-aware departure."""
        endpoints = (("origin", self.origin), ("destination", self.destination))
        for name, coordinate in endpoints:
            _validate_coordinate(name, coordinate)
        if not isinstance(self.departure, datetime):
            raise ValueError("departure must be a datetime")
        if self.departure.tzinfo is None or self.departure.utcoffset() is None:
            raise ValueError("departure must be timezone-aware")


@runtime_checkable
class RoutingProvider(Protocol):
    """Plans candidate routes between two coordinates."""

    provider_name: str
    """Short diagnostic name exposed in API responses (e.g. "mock", "osrm")."""

    def geocode(self, address: str) -> Coordinate:
        """Resolve a place name to WGS84 coordinates."""
        ...

    def plan_routes(
        self, request: RoutePlanRequest
    ) -> tuple[RouteGeometry, RouteGeometry, RouteGeometry]:
        """Return exactly three candidate route geometries."""
        ...


@runtime_checkable
class WeatherProvider(Protocol):
    """Reads normalized weather for a point in space and time."""

    def get_weather(
        self, latitude: float, longitude: float, *, valid_time: datetime
    ) -> WeatherObservation | None:
        """Return the observation, or None when weather is unavailable."""
        ...
