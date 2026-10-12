"""Deterministic mock routing provider for development and tests.

Always returns exactly three candidate routes (south, central, north
variants) with fixed geometry derived from the request. No network,
no credentials, no randomness.
"""

from hashlib import sha256
from math import asin, cos, radians, sin, sqrt

from routing.checkpoints import Coordinate

from .errors import ProviderError, ProviderPermanentError, ProviderTransientError
from .protocols import RouteGeometry, RoutePlanRequest

_EARTH_RADIUS_MILES = 3958.7613
_MOCK_SPEED_MPH = 55.0
_POINTS_PER_ROUTE = 5
_LATERAL_OFFSETS_DEGREES = (-0.5, 0.0, 0.5)
_DISTANCE_FACTORS = (1.12, 1.0, 1.18)

_KNOWN_ADDRESSES = {
    "denver, co": Coordinate(latitude=39.7392, longitude=-104.9903),
    "kansas city, mo": Coordinate(latitude=39.0997, longitude=-94.5786),
    "chicago, il": Coordinate(latitude=41.8781, longitude=-87.6298),
    "detroit, mi": Coordinate(latitude=42.3314, longitude=-83.0458),
}

# Fallback geocoding box (continental US) for addresses outside the table.
_FALLBACK_LATITUDE = (25.0, 48.0)
_FALLBACK_LONGITUDE = (-125.0, -67.0)


def _haversine_miles(origin: Coordinate, destination: Coordinate) -> float:
    """Great-circle distance between two coordinates in miles."""
    lat1, lon1 = radians(origin.latitude), radians(origin.longitude)
    lat2, lon2 = radians(destination.latitude), radians(destination.longitude)
    Hav = (
        sin((lat2 - lat1) / 2) ** 2
        + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_MILES * asin(sqrt(Hav))


def _interpolate(origin: float, destination: float, fraction: float) -> float:
    """Linear interpolation between two scalar values."""
    return origin + (destination - origin) * fraction


def _clamp_latitude(latitude: float) -> float:
    """Keep a mock offset inside WGS84 bounds."""
    return max(-90.0, min(90.0, latitude))


class MockRoutingProvider:
    """RoutingProvider returning three fixed deterministic routes."""

    def __init__(
        self,
        failure: ProviderError | None = None,
        transient_failures: int = 0,
    ) -> None:
        """Configure simulated failures.

        Args:
            failure: Raised on every call when set; takes precedence over
                transient_failures when both are configured.
            transient_failures: Number of leading calls that raise
                ProviderTransientError before succeeding.
        """
        if transient_failures < 0:
            raise ValueError("transient_failures cannot be negative")
        self._failure = failure
        self._transient_failures = transient_failures
        self.calls = 0

    def geocode(self, address: str) -> Coordinate:
        """Resolve a known address or deterministically derive coordinates.

        Known addresses resolve to fixed coordinates. Any other non-blank
        address derives stable coordinates from its SHA-256 digest, so
        repeated lookups agree without network access.

        The fallback does not validate that an address is real or
        deliverable: gibberish resolves instead of failing. A real
        geocoding adapter must reject unknown addresses; only the mock
        is this permissive.
        """
        self.calls += 1
        if self._failure is not None:
            raise self._failure
        if self._transient_failures > 0:
            self._transient_failures -= 1
            raise ProviderTransientError("mock transient geocoding failure")
        key = address.strip().lower()
        if not key:
            raise ProviderPermanentError("mock provider cannot geocode a blank address")
        if key in _KNOWN_ADDRESSES:
            return _KNOWN_ADDRESSES[key]
        digest = sha256(key.encode("utf-8")).digest()
        latitude = _FALLBACK_LATITUDE[0] + (
            int.from_bytes(digest[:8], "big") / 2**64
        ) * (_FALLBACK_LATITUDE[1] - _FALLBACK_LATITUDE[0])
        longitude = _FALLBACK_LONGITUDE[0] + (
            int.from_bytes(digest[8:16], "big") / 2**64
        ) * (_FALLBACK_LONGITUDE[1] - _FALLBACK_LONGITUDE[0])
        return Coordinate(latitude=latitude, longitude=longitude)

    def plan_routes(
        self, request: RoutePlanRequest
    ) -> tuple[RouteGeometry, RouteGeometry, RouteGeometry]:
        """Build three deterministic variants from origin to destination.

        Variant order is stable: south, central, north. The central
        variant follows the straight path and is always the shortest.
        """
        self.calls += 1
        if self._failure is not None:
            raise self._failure
        if self._transient_failures > 0:
            self._transient_failures -= 1
            raise ProviderTransientError("mock transient routing failure")
        if request.origin == request.destination:
            raise ProviderPermanentError("mock provider cannot route zero distance")

        straight = _haversine_miles(request.origin, request.destination)
        origin, destination = request.origin, request.destination
        return (
            self._build_route(origin, destination, 0, straight),
            self._build_route(origin, destination, 1, straight),
            self._build_route(origin, destination, 2, straight),
        )

    def _build_route(
        self,
        origin: Coordinate,
        destination: Coordinate,
        index: int,
        straight_miles: float,
    ) -> RouteGeometry:
        """Build one variant with a fixed lateral offset and length factor."""
        offset = _LATERAL_OFFSETS_DEGREES[index]
        points = tuple(
            Coordinate(
                latitude=_clamp_latitude(
                    _interpolate(origin.latitude, destination.latitude, step)
                    + offset * sin(step * 3.141592653589793)
                ),
                longitude=_interpolate(origin.longitude, destination.longitude, step),
            )
            for step in (i / (_POINTS_PER_ROUTE - 1) for i in range(_POINTS_PER_ROUTE))
        )
        distance_miles = straight_miles * _DISTANCE_FACTORS[index]
        return RouteGeometry(
            points=points,
            distance_miles=distance_miles,
            duration_seconds=distance_miles / _MOCK_SPEED_MPH * 3600.0,
        )
