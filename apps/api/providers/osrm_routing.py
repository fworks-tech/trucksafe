"""Road-following routing provider on the public OSRM demo server.

No credentials: OSRM needs none and Photon (OSM geocoding) works with
a user agent only. Select it with ``TRUCKSAFE_ROUTING_PROVIDER=osrm``;
the deterministic mock stays the default so tests and offline runs
never touch the network.

Only normalized domain types cross this boundary: WGS84 coordinates in
canonical units. Provider URLs, meters, and GeoJSON ordering stay here.
"""

import json
from collections.abc import Callable, Mapping
from math import asin, cos, isfinite, radians, sin, sqrt
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from routing.checkpoints import Coordinate

from .errors import ProviderPermanentError, ProviderTransientError
from .protocols import RouteGeometry, RoutePlanRequest

_OSRM_BASE_URL = "https://router.project-osrm.org"
_PHOTON_BASE_URL = "https://photon.komoot.io"
_USER_AGENT = "TruckSafe/1.0 (route-planning demo; contact: support@example.invalid)"
_METERS_PER_MILE = 1609.344
_TIMEOUT_SECONDS = 8.0
_MAX_VIA_ATTEMPTS = 4
# Lateral offsets (degrees) for derived alternates when OSRM returns
# fewer than three routes. Each is re-routed through OSRM, so the
# variant still follows real roads.
_VIA_OFFSETS_DEGREES = (0.4, -0.4, 0.8, -0.8)

HttpTransport = Callable[[str, Mapping[str, str]], bytes]


def _default_transport(url: str, headers: Mapping[str, str]) -> bytes:
    """GET url with stdlib urllib; network failures stay transient."""
    request = urlrequest.Request(url, headers=dict(headers))
    try:
        with urlrequest.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            return response.read()
    except (urlerror.URLError, TimeoutError, OSError) as exc:
        raise ProviderTransientError(f"osrm transport failure: {exc}") from exc


def _decode_payload(body: bytes, *, what: str) -> object:
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ProviderTransientError(f"osrm {what}: invalid payload") from exc


def _first_us_point(payload: object) -> Coordinate | None:
    """Extract the first US point from a Photon FeatureCollection.

    Returns None when nothing usable arrived; malformed shapes are
    transient (the next request may succeed). A point is only returned
    when both coordinates are finite, so callers never see half-missing
    values.
    """
    if not isinstance(payload, dict):
        raise ProviderTransientError("osrm geocode: invalid payload")
    features = payload.get("features")
    if not isinstance(features, list):
        raise ProviderTransientError("osrm geocode: invalid payload")
    for feature in features:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry")
        properties = feature.get("properties")
        if not isinstance(geometry, dict) or not isinstance(properties, dict):
            continue
        if str(properties.get("countrycode", "")).upper() not in ("", "US"):
            continue
        coordinates = geometry.get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        try:
            longitude = float(coordinates[0])
            latitude = float(coordinates[1])
        except (TypeError, ValueError):
            continue
        if isfinite(latitude) and isfinite(longitude):
            return Coordinate(latitude=latitude, longitude=longitude)
    return None


# Reported totals must roughly agree with the polyline they describe.
# Bands are generous (real road circuity vs. great-circle math), but a
# meters/miles mix-up (1609x) or a corrupt payload lands far outside.
_POLYLINE_RATIO_MIN = 0.2
_POLYLINE_RATIO_MAX = 5.0
# No road vehicle averages above this; higher implies corrupt duration
# (e.g. milliseconds reported as seconds).
_MAX_PLAUSIBLE_SPEED_MPH = 500.0
_EARTH_RADIUS_MILES = 3958.7613


def _polyline_miles(points: tuple[Coordinate, ...]) -> float:
    """Great-circle length of a polyline in miles."""
    total = 0.0
    for start, end in zip(points, points[1:], strict=False):
        lat1, lon1 = radians(start.latitude), radians(start.longitude)
        lat2, lon2 = radians(end.latitude), radians(end.longitude)
        hav = (
            sin((lat2 - lat1) / 2) ** 2
            + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
        )
        total += 2 * _EARTH_RADIUS_MILES * asin(sqrt(hav))
    return total


def _check_totals_against_polyline(
    points: tuple[Coordinate, ...],
    distance_miles: float,
    duration_seconds: float,
) -> None:
    """Reject totals that disagree with the polyline they describe."""
    polyline = _polyline_miles(points)
    if polyline <= 0.0:
        raise ValueError("route polyline has no length")
    if not (
        _POLYLINE_RATIO_MIN * polyline
        <= distance_miles
        <= _POLYLINE_RATIO_MAX * polyline
    ):
        raise ValueError(
            f"reported distance {distance_miles!r} disagrees "
            f"with polyline length {polyline!r}"
        )
    if duration_seconds <= 0.0 or not isfinite(duration_seconds):
        raise ValueError(f"duration must be finite and positive: {duration_seconds!r}")
    speed_mph = distance_miles / duration_seconds * 3600.0
    if not isfinite(speed_mph) or speed_mph > _MAX_PLAUSIBLE_SPEED_MPH:
        raise ValueError(f"implied speed {speed_mph!r} mph is not plausible")


class OsrmRoutingProvider:
    """RoutingProvider backed by OSRM (roads) and Photon (geocoding).

    Uses the public OSRM demo server with the default ``driving`` profile:
    road-following geometry, but a car profile with no truck-specific
    restrictions (height, weight, hazmat). Plan accordingly.
    """

    provider_name = "osrm"

    def __init__(
        self,
        *,
        base_url: str = _OSRM_BASE_URL,
        geocode_url: str = _PHOTON_BASE_URL,
        transport: HttpTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._geocode_url = geocode_url.rstrip("/")
        self._transport = transport or _default_transport
        self.calls = 0

    def _get(self, url: str) -> bytes:
        """GET url, mapping transport failures to transient provider errors.

        The injected transport (stdlib urllib by default) raises raw
        network errors; they must never escape the adapter unmapped, or
        callers see internals instead of the documented 503 path.
        """
        try:
            return self._transport(url, {"User-Agent": _USER_AGENT})
        except (TimeoutError, OSError) as exc:
            raise ProviderTransientError(f"osrm transport failure: {exc}") from exc

    def geocode(self, address: str) -> Coordinate:
        """Resolve a place name with Photon; empty results are permanent."""
        self.calls += 1
        key = address.strip()
        if not key:
            raise ProviderPermanentError("osrm provider cannot geocode a blank address")
        query = urlparse.urlencode({"q": key, "limit": 1, "bbox": "-125,25,-67,48"})
        payload = _decode_payload(
            self._get(f"{self._geocode_url}/api/?{query}"),
            what="geocode",
        )
        point = _first_us_point(payload)
        if point is None:
            raise ProviderPermanentError(f"osrm provider cannot geocode {key!r}")
        return point

    def plan_routes(
        self, request: RoutePlanRequest
    ) -> tuple[RouteGeometry, RouteGeometry, RouteGeometry]:
        """Return exactly three road-following candidate routes."""
        self.calls += 1
        if request.origin == request.destination:
            raise ProviderPermanentError("osrm provider cannot route zero distance")
        geometries = self._fetch_routes(request.origin, request.destination)
        if len(geometries) < 3:
            geometries = self._pad_with_via_routes(request, geometries)
        if len(geometries) < 3:
            raise ProviderTransientError(
                "osrm provider returned fewer than three routes"
            )
        return (geometries[0], geometries[1], geometries[2])

    def _fetch_routes(
        self, origin: Coordinate, destination: Coordinate
    ) -> list[RouteGeometry]:
        """Primary OSRM call with up to three alternatives."""
        path = (
            f"/route/v1/driving/"
            f"{origin.longitude},{origin.latitude};"
            f"{destination.longitude},{destination.latitude}"
            f"?overview=full&geometries=geojson&alternatives=3"
        )
        payload = _decode_payload(
            self._get(f"{self._base_url}{path}"),
            what="route",
        )
        if not isinstance(payload, dict):
            raise ProviderTransientError("osrm route: invalid payload")
        code = payload.get("code")
        if code != "Ok":
            if code in ("NoRoute", "NoSegment", "InvalidOptions", "InvalidValue"):
                raise ProviderPermanentError(f"osrm provider cannot route: {code}")
            raise ProviderTransientError(f"osrm provider failed with code: {code}")
        routes = payload.get("routes")
        if not isinstance(routes, list):
            raise ProviderTransientError("osrm route: invalid payload")
        geometries: list[RouteGeometry] = []
        for route in routes:
            try:
                geometries.append(self._to_geometry(route))
            except (KeyError, TypeError, ValueError):
                continue
        return geometries

    @staticmethod
    def _to_geometry(route: object) -> RouteGeometry:
        """Normalize one OSRM route (GeoJSON lon/lat) to domain units.

        Rejects malformed shapes: non-list coordinates, fewer than two
        points, non-finite or out-of-range values (which also catches
        swapped [lat, lon] order for US routes, since e.g. -96.8 is not
        a valid latitude), and reported totals that disagree with the
        polyline itself (unit mix-ups, corrupt payloads).
        """
        if not isinstance(route, dict):
            raise ValueError("not a route object")
        geometry = route["geometry"]
        raw = geometry["coordinates"]
        if not isinstance(raw, list) or len(raw) < 2:
            raise ValueError("route has too few points")
        points: list[Coordinate] = []
        for pair in raw:
            if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                raise ValueError("route coordinate must be a [lon, lat] pair")
            longitude = float(pair[0])
            latitude = float(pair[1])
            if not isfinite(latitude) or not isfinite(longitude):
                raise ValueError("route coordinate must be finite")
            if not -90.0 <= latitude <= 90.0 or not -180.0 <= longitude <= 180.0:
                raise ValueError(
                    f"route coordinate out of WGS84 range: [{pair[0]!r}, {pair[1]!r}]"
                )
            points.append(Coordinate(latitude=latitude, longitude=longitude))
        distance_miles = float(route["distance"]) / _METERS_PER_MILE
        duration_seconds = float(route["duration"])
        _check_totals_against_polyline(tuple(points), distance_miles, duration_seconds)
        return RouteGeometry(
            points=tuple(points),
            distance_miles=distance_miles,
            duration_seconds=duration_seconds,
        )

    def _pad_with_via_routes(
        self,
        request: RoutePlanRequest,
        geometries: list[RouteGeometry],
    ) -> list[RouteGeometry]:
        """Derive alternates by re-routing through offset via points.

        The offsets only pick a corridor; OSRM snaps each variant back
        onto real roads, so no variant is a straight line.
        """
        if not geometries:
            return geometries
        seed = geometries[0].points
        third = max(1, len(seed) // 3)
        anchors = (seed[third], seed[-third - 1])
        attempts = 0
        for offset in _VIA_OFFSETS_DEGREES:
            if len(geometries) >= 3 or attempts >= _MAX_VIA_ATTEMPTS:
                break
            via = Coordinate(
                latitude=anchors[attempts % 2].latitude + offset,
                longitude=anchors[attempts % 2].longitude,
            )
            attempts += 1
            try:
                extra = self._fetch_via_route(request.origin, via, request.destination)
            except ProviderPermanentError:
                continue
            geometries.extend(extra)
        return geometries

    def _fetch_via_route(
        self, origin: Coordinate, via: Coordinate, destination: Coordinate
    ) -> list[RouteGeometry]:
        """Single OSRM call forced through an intermediate waypoint."""
        path = (
            f"/route/v1/driving/"
            f"{origin.longitude},{origin.latitude};"
            f"{via.longitude},{via.latitude};"
            f"{destination.longitude},{destination.latitude}"
            f"?overview=full&geometries=geojson"
        )
        payload = _decode_payload(
            self._get(f"{self._base_url}{path}"),
            what="route",
        )
        if not isinstance(payload, dict) or payload.get("code") != "Ok":
            code = payload.get("code") if isinstance(payload, dict) else None
            if code in ("NoRoute", "NoSegment", "InvalidOptions", "InvalidValue"):
                raise ProviderPermanentError(f"osrm provider cannot route: {code}")
            raise ProviderTransientError(f"osrm provider failed with code: {code}")
        routes = payload.get("routes")
        if not isinstance(routes, list):
            raise ProviderTransientError("osrm route: invalid payload")
        geometries: list[RouteGeometry] = []
        for route in routes:
            try:
                geometries.append(self._to_geometry(route))
            except (KeyError, TypeError, ValueError):
                continue
        return geometries
