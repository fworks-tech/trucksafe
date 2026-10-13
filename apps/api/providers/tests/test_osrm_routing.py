"""Unit tests for the OSRM routing adapter.

All HTTP is stubbed through the injected transport: these tests never
touch the network.
"""

import json
from datetime import UTC, datetime

import pytest

from providers.errors import ProviderPermanentError, ProviderTransientError
from providers.osrm_routing import HttpTransport, OsrmRoutingProvider
from providers.protocols import RoutePlanRequest
from routing.checkpoints import Coordinate

_ORIGIN = Coordinate(latitude=41.8781, longitude=-87.6298)
_DESTINATION = Coordinate(latitude=29.7604, longitude=-95.3698)


def make_request() -> RoutePlanRequest:
    return RoutePlanRequest(
        origin=_ORIGIN,
        destination=_DESTINATION,
        departure=datetime(2026, 10, 14, 13, 0, tzinfo=UTC),
    )


def route_payload(coordinates: list[list[float]]) -> dict:
    return {
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "distance": 1000.0,
        "duration": 3600.0,
    }


def transport_for(responses: dict[str, bytes]) -> HttpTransport:
    """Stub transport matching requests by URL substring."""

    def transport(url: str, headers: object) -> bytes:
        for marker, body in responses.items():
            if marker in url:
                return body
        raise AssertionError(f"unexpected request: {url}")

    return transport


def photon_payload(longitude: float, latitude: float) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"countrycode": "US", "name": "Houston"},
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                },
            }
        ],
    }


def test_geocode_resolves_photon_result() -> None:
    provider = OsrmRoutingProvider(
        transport=transport_for(
            {"/api/": json.dumps(photon_payload(-95.3698, 29.7604)).encode()}
        )
    )
    assert provider.geocode("Houston, TX") == Coordinate(
        latitude=29.7604, longitude=-95.3698
    )


def test_geocode_empty_result_is_permanent() -> None:
    empty = json.dumps({"type": "FeatureCollection", "features": []}).encode()
    provider = OsrmRoutingProvider(transport=transport_for({"/api/": empty}))
    with pytest.raises(ProviderPermanentError):
        provider.geocode("Nowhere, ZZ")


def test_geocode_rejects_blank_address() -> None:
    provider = OsrmRoutingProvider(transport=transport_for({}))
    with pytest.raises(ProviderPermanentError):
        provider.geocode("   ")


def test_plan_routes_follows_road_geometry_in_order() -> None:
    line = [[-87.6, 41.8], [-90.0, 40.0], [-95.3, 29.7]]
    body = json.dumps({"code": "Ok", "routes": [route_payload(line)] * 3}).encode()
    provider = OsrmRoutingProvider(transport=transport_for({"route/v1": body}))
    first, _, _ = provider.plan_routes(make_request())
    # GeoJSON is [lon, lat]; internal points are (lat, lon) in order.
    assert first.points[0] == Coordinate(latitude=41.8, longitude=-87.6)
    assert first.points[-1] == Coordinate(latitude=29.7, longitude=-95.3)
    assert first.distance_miles == pytest.approx(1000.0 / 1609.344)
    assert first.duration_seconds == 3600.0


def test_plan_routes_pads_with_via_routes() -> None:
    line = [[-87.6, 41.8], [-90.0, 40.0], [-95.3, 29.7]]
    single = json.dumps({"code": "Ok", "routes": [route_payload(line)]}).encode()
    via = json.dumps(
        {"code": "Ok", "routes": [route_payload(line), route_payload(line)]}
    ).encode()
    calls: list[str] = []

    def transport(url: str, headers: object) -> bytes:
        calls.append(url)
        return via if url.count(";") == 2 else single

    provider = OsrmRoutingProvider(transport=transport)
    routes = provider.plan_routes(make_request())
    assert len(routes) == 3
    assert any(url.count(";") == 2 for url in calls)


def test_plan_routes_noroute_is_permanent() -> None:
    provider = OsrmRoutingProvider(
        transport=transport_for({"route/v1": json.dumps({"code": "NoRoute"}).encode()})
    )
    with pytest.raises(ProviderPermanentError):
        provider.plan_routes(make_request())


def test_plan_routes_transport_failure_is_transient() -> None:
    def failing(url: str, headers: object) -> bytes:
        raise ProviderTransientError("boom")

    provider = OsrmRoutingProvider(transport=failing)
    with pytest.raises(ProviderTransientError):
        provider.plan_routes(make_request())


def test_plan_routes_rejects_zero_distance() -> None:
    provider = OsrmRoutingProvider(transport=transport_for({}))
    request = RoutePlanRequest(
        origin=_ORIGIN,
        destination=_ORIGIN,
        departure=datetime(2026, 10, 14, 13, 0, tzinfo=UTC),
    )
    with pytest.raises(ProviderPermanentError):
        provider.plan_routes(request)
