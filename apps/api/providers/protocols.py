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
        for name, value in (
            ("distance_miles", self.distance_miles),
            ("duration_seconds", self.duration_seconds),
        ):
            if not isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive: {value!r}")


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
        """Require a timezone-aware departure time."""
        if not isinstance(self.departure, datetime):
            raise ValueError("departure must be a datetime")
        if self.departure.tzinfo is None or self.departure.utcoffset() is None:
            raise ValueError("departure must be timezone-aware")


@runtime_checkable
class RoutingProvider(Protocol):
    """Plans candidate routes between two coordinates."""

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
