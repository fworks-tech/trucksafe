"""Unit tests for the Open-Meteo weather adapter.

All HTTP is stubbed through the injected transport: these tests never
touch the network.
"""

import json
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta

import pytest

from providers.errors import ProviderTransientError
from providers.openmeteo_weather import OpenMeteoWeatherProvider
from providers.osrm_routing import HttpTransport

_START = datetime(2026, 10, 14, 0, 0, tzinfo=UTC)


def series_payload(
    winds: list[float],
    rains: list[float],
    snows: list[float],
    start: datetime = _START,
) -> bytes:
    """Minimal Open-Meteo forecast payload with one value per hour."""
    return json.dumps(
        {
            "latitude": 41.88,
            "longitude": -87.63,
            "timezone": "UTC",
            "hourly": {
                "time": [
                    (start + timedelta(hours=offset)).strftime("%Y-%m-%dT%H:%M")
                    for offset in range(len(winds))
                ],
                "wind_speed_10m": winds,
                "precipitation": rains,
                "snowfall": snows,
            },
        }
    ).encode()


def transport_for(bodies: list[bytes]) -> tuple[HttpTransport, list[int]]:
    """Stub transport replaying payloads; the list records call count."""

    calls = [0]

    def transport(url: str, headers: Mapping[str, str]) -> bytes:
        assert "api.open-meteo.com" in url
        assert "hourly=wind_speed_10m" in url
        body = bodies[min(calls[0], len(bodies) - 1)]
        calls[0] += 1
        return body

    return transport, calls


def test_converts_provider_units_to_canonical() -> None:
    transport, _ = transport_for([series_payload([16.09344], [25.4], [2.54])])
    provider = OpenMeteoWeatherProvider(transport=transport)
    observation = provider.get_weather(
        41.88, -87.63, valid_time=_START + timedelta(minutes=10)
    )
    assert observation is not None
    assert observation.wind_mph == pytest.approx(10.0)
    assert observation.rain_inches_per_hour == pytest.approx(1.0)
    assert observation.snow_inches_per_hour == pytest.approx(1.0)


def test_lands_on_nearest_hour_and_caches_series() -> None:
    transport, calls = transport_for(
        [series_payload([10.0, 20.0, 30.0], [0.0] * 3, [0.0] * 3)]
    )
    provider = OpenMeteoWeatherProvider(transport=transport)
    first = provider.get_weather(41.88, -87.63, valid_time=_START + timedelta(hours=2))
    nearby = provider.get_weather(
        41.8801, -87.6301, valid_time=_START + timedelta(hours=1, minutes=40)
    )
    assert first is not None and nearby is not None
    assert first.wind_mph == nearby.wind_mph
    assert calls == [1]


def test_null_hours_are_unavailable_weather() -> None:
    body = json.dumps(
        {
            "hourly": {
                "time": ["2026-10-14T00:00", "2026-10-14T01:00"],
                "wind_speed_10m": [10.0, None],
                "precipitation": [0.0, None],
                "snowfall": [0.0, None],
            }
        }
    ).encode()
    transport, _ = transport_for([body])
    provider = OpenMeteoWeatherProvider(transport=transport)
    assert (
        provider.get_weather(41.88, -87.63, valid_time=_START + timedelta(hours=1))
        is None
    )
    assert provider.get_weather(41.88, -87.63, valid_time=_START) is not None


def test_returns_none_beyond_forecast_horizon() -> None:
    transport, _ = transport_for([series_payload([10.0], [0.0], [0.0])])
    provider = OpenMeteoWeatherProvider(transport=transport)
    assert (
        provider.get_weather(41.88, -87.63, valid_time=_START + timedelta(days=30))
        is None
    )
    assert (
        provider.get_weather(41.88, -87.63, valid_time=_START - timedelta(hours=1))
        is None
    )


def test_rejects_mismatched_series() -> None:
    body = json.dumps(
        {
            "hourly": {
                "time": ["2026-10-14T00:00"],
                "wind_speed_10m": [10.0, 20.0],
                "precipitation": [0.0],
                "snowfall": [0.0],
            }
        }
    ).encode()
    transport, _ = transport_for([body])
    provider = OpenMeteoWeatherProvider(transport=transport)
    with pytest.raises(ProviderTransientError):
        provider.get_weather(41.88, -87.63, valid_time=_START)


def test_rejects_non_numeric_values() -> None:
    body = json.dumps(
        {
            "hourly": {
                "time": ["2026-10-14T00:00"],
                "wind_speed_10m": ["calm"],
                "precipitation": [0.0],
                "snowfall": [0.0],
            }
        }
    ).encode()
    transport, _ = transport_for([body])
    provider = OpenMeteoWeatherProvider(transport=transport)
    with pytest.raises(ProviderTransientError):
        provider.get_weather(41.88, -87.63, valid_time=_START)


def test_rejects_invalid_payload() -> None:
    transport, _ = transport_for([b"not json"])
    provider = OpenMeteoWeatherProvider(transport=transport)
    with pytest.raises(ProviderTransientError):
        provider.get_weather(41.88, -87.63, valid_time=_START)


def test_rejects_caller_errors() -> None:
    transport, _ = transport_for([series_payload([10.0], [0.0], [0.0])])
    provider = OpenMeteoWeatherProvider(transport=transport)
    with pytest.raises(ValueError):
        provider.get_weather(float("nan"), -87.63, valid_time=_START)
    with pytest.raises(ValueError):
        provider.get_weather(41.88, -87.63, valid_time=datetime(2026, 10, 14, 0, 0))
