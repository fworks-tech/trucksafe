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

# Real city-center coordinates for the cities offered by the frontend
# autocomplete. Any other non-blank address derives stable coordinates
# from its SHA-256 digest; only this table guarantees true placement.
_KNOWN_ADDRESSES = {
    "albuquerque, nm": Coordinate(latitude=35.0844, longitude=-106.6504),
    "atlanta, ga": Coordinate(latitude=33.7490, longitude=-84.3880),
    "austin, tx": Coordinate(latitude=30.2672, longitude=-97.7431),
    "baltimore, md": Coordinate(latitude=39.2904, longitude=-76.6122),
    "birmingham, al": Coordinate(latitude=33.5186, longitude=-86.8104),
    "boston, ma": Coordinate(latitude=42.3601, longitude=-71.0589),
    "charlotte, nc": Coordinate(latitude=35.2271, longitude=-80.8431),
    "chicago, il": Coordinate(latitude=41.8781, longitude=-87.6298),
    "cincinnati, oh": Coordinate(latitude=39.1031, longitude=-84.5120),
    "cleveland, oh": Coordinate(latitude=41.4993, longitude=-81.6944),
    "colorado springs, co": Coordinate(latitude=38.8339, longitude=-104.8214),
    "columbus, oh": Coordinate(latitude=39.9612, longitude=-82.9988),
    "dallas, tx": Coordinate(latitude=32.7767, longitude=-96.7970),
    "denver, co": Coordinate(latitude=39.7392, longitude=-104.9903),
    "detroit, mi": Coordinate(latitude=42.3314, longitude=-83.0458),
    "el paso, tx": Coordinate(latitude=31.7619, longitude=-106.4850),
    "fort worth, tx": Coordinate(latitude=32.7555, longitude=-97.3308),
    "houston, tx": Coordinate(latitude=29.7604, longitude=-95.3698),
    "indianapolis, in": Coordinate(latitude=39.7684, longitude=-86.1581),
    "jackson, ms": Coordinate(latitude=32.2988, longitude=-90.1848),
    "jacksonville, fl": Coordinate(latitude=30.3322, longitude=-81.6557),
    "kansas city, mo": Coordinate(latitude=39.0997, longitude=-94.5786),
    "louisville, ky": Coordinate(latitude=38.2527, longitude=-85.7585),
    "los angeles, ca": Coordinate(latitude=34.0522, longitude=-118.2437),
    "memphis, tn": Coordinate(latitude=35.1495, longitude=-90.0490),
    "miami, fl": Coordinate(latitude=25.7617, longitude=-80.1918),
    "milwaukee, wi": Coordinate(latitude=43.0389, longitude=-87.9065),
    "minneapolis, mn": Coordinate(latitude=44.9778, longitude=-93.2650),
    "nashville, tn": Coordinate(latitude=36.1627, longitude=-86.7816),
    "new orleans, la": Coordinate(latitude=29.9511, longitude=-90.0715),
    "new york, ny": Coordinate(latitude=40.7128, longitude=-74.0060),
    "oklahoma city, ok": Coordinate(latitude=35.4676, longitude=-97.5164),
    "omaha, ne": Coordinate(latitude=41.2565, longitude=-95.9345),
    "philadelphia, pa": Coordinate(latitude=39.9526, longitude=-75.1652),
    "phoenix, az": Coordinate(latitude=33.4484, longitude=-112.0740),
    "pittsburgh, pa": Coordinate(latitude=40.4406, longitude=-79.9959),
    "portland, or": Coordinate(latitude=45.5152, longitude=-122.6784),
    "raleigh, nc": Coordinate(latitude=35.7796, longitude=-78.6382),
    "salt lake city, ut": Coordinate(latitude=40.7608, longitude=-111.8910),
    "san antonio, tx": Coordinate(latitude=29.4241, longitude=-98.4936),
    "san diego, ca": Coordinate(latitude=32.7157, longitude=-117.1611),
    "san francisco, ca": Coordinate(latitude=37.7749, longitude=-122.4194),
    "seattle, wa": Coordinate(latitude=47.6062, longitude=-122.3321),
    "st. louis, mo": Coordinate(latitude=38.6270, longitude=-90.1994),
    "tampa, fl": Coordinate(latitude=27.9506, longitude=-82.4572),
    "tucson, az": Coordinate(latitude=32.2226, longitude=-110.9747),
    "tulsa, ok": Coordinate(latitude=36.1540, longitude=-95.9928),
    "wichita, ks": Coordinate(latitude=37.6872, longitude=-97.3301),
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
