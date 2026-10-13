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
from math import isfinite
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


def _first_us_point(payload: object) -> tuple[float | None, float | None]:
    """Extract the first US point from a Photon FeatureCollection.

    Returns (None, None) when nothing usable arrived; malformed shapes
    are transient (the next request may succeed).
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
            return latitude, longitude
    return None, None


class OsrmRoutingProvider:
    """RoutingProvider backed by OSRM (roads) and Photon (geocoding)."""

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

    def geocode(self, address: str) -> Coordinate:
        """Resolve a place name with Photon; empty results are permanent."""
        self.calls += 1
        key = address.strip()
        if not key:
            raise ProviderPermanentError("osrm provider cannot geocode a blank address")
        query = urlparse.urlencode(
            {"q": key, "limit": 1, "bbox": "-125,25,-67,48"}
        )
        payload = _decode_payload(
            self._transport(
                f"{self._geocode_url}/api/?{query}",
                {"User-Agent": _USER_AGENT},
            ),
            what="geocode",
        )
        latitude, longitude = _first_us_point(payload)
        if latitude is None:
            raise ProviderPermanentError(f"osrm provider cannot geocode {key!r}")
        return Coordinate(latitude=latitude, longitude=longitude)

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
            self._transport(f"{self._base_url}{path}", {"User-Agent": _USER_AGENT}),
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
        """Normalize one OSRM route (GeoJSON lon/lat) to domain units."""
        if not isinstance(route, dict):
            raise ValueError("not a route object")
        geometry = route["geometry"]
        raw = geometry["coordinates"]
        points = tuple(
            Coordinate(latitude=float(pair[1]), longitude=float(pair[0]))
            for pair in raw
        )
        if len(points) < 2:
            raise ValueError("route has too few points")
        distance_miles = float(route["distance"]) / _METERS_PER_MILE
        duration_seconds = float(route["duration"])
        return RouteGeometry(
            points=points,
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
            self._transport(f"{self._base_url}{path}", {"User-Agent": _USER_AGENT}),
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
