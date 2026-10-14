"""Real weather provider on the Open-Meteo forecast API.

No credentials: Open-Meteo needs none. Select it with
``TRUCKSAFE_WEATHER_PROVIDER=openmeteo``; the deterministic mock stays
the default so tests and offline runs never touch the network.

Only normalized domain types cross this boundary: WGS84 coordinates in,
canonical units out (mph, inches/hr). Provider units (km/h, mm, cm),
URL layout, and hourly-array indexing stay here.

One HTTP call fetches the full hourly series for a point; lookups for
the same rounded coordinates within one provider instance reuse the
fetched series instead of calling again. Instances are created per
request, so the cache only lives for that request.
"""

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from math import floor, isfinite
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from risk.schemas import WeatherObservation

from .errors import ProviderPermanentError, ProviderTransientError
from .osrm_routing import HttpTransport

_OPENMETEO_BASE_URL = "https://api.open-meteo.com/v1/forecast"
_USER_AGENT = "TruckSafe/1.0 (route-planning demo; contact: support@example.invalid)"
_TIMEOUT_SECONDS = 8.0
_FORECAST_DAYS = 16
# Cache granularity (degrees): ~1.1 km, well within forecast resolution.
_CACHE_ROUND_DIGITS = 2
_KMH_PER_MPH = 1.609344
_MM_PER_INCH = 25.4
_CM_PER_INCH = 2.54


def _default_transport(url: str, headers: Mapping[str, str]) -> bytes:
    """GET url with stdlib urllib; 4xx is permanent, the rest transient."""
    request = urlrequest.Request(url, headers=dict(headers))
    try:
        with urlrequest.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            return response.read()
    except urlerror.HTTPError as exc:
        if exc.code in (408, 429):
            raise ProviderTransientError(
                f"openmeteo transport failure: HTTP {exc.code}"
            ) from exc
        if 400 <= exc.code < 500:
            raise ProviderPermanentError(
                f"openmeteo rejected the request: HTTP {exc.code}"
            ) from exc
        raise ProviderTransientError(
            f"openmeteo transport failure: HTTP {exc.code}"
        ) from exc
    except (urlerror.URLError, TimeoutError, OSError) as exc:
        raise ProviderTransientError(f"openmeteo transport failure: {exc}") from exc


class OpenMeteoWeatherProvider:
    """WeatherProvider reading hourly forecast series from Open-Meteo."""

    def __init__(self, transport: HttpTransport = _default_transport) -> None:
        """Configure the HTTP transport (stubbed in tests)."""
        self._transport = transport
        self._series: dict[tuple[float, float], list[WeatherObservation | None]] = {}
        self._series_start: dict[tuple[float, float], datetime] = {}

    def get_weather(
        self, latitude: float, longitude: float, *, valid_time: datetime
    ) -> WeatherObservation | None:
        """Return the nearest forecast hour, or None when uncovered.

        Out-of-range times (past the 16-day horizon) are unavailable
        weather, not errors: the checkpoint is built without risk.
        """
        _validate_lookup(latitude, longitude, valid_time)
        key = (
            round(latitude, _CACHE_ROUND_DIGITS),
            round(longitude, _CACHE_ROUND_DIGITS),
        )
        if key not in self._series:
            self._fetch_series(key)
        start = self._series_start[key]
        index = floor((valid_time - start).total_seconds() / 3600.0 + 0.5)
        if index < 0 or index >= len(self._series[key]):
            return None
        return self._series[key][index]

    def _get(self, url: str) -> bytes:
        """GET url, mapping raw transport failures to transient errors.

        The injected transport raises raw network errors; they must never
        escape unmapped, or callers see internals instead of the 503 path.
        """
        try:
            return self._transport(url, {"User-Agent": _USER_AGENT})
        except (urlerror.URLError, TimeoutError, OSError) as exc:
            raise ProviderTransientError(f"openmeteo transport failure: {exc}") from exc

    def _fetch_series(self, key: tuple[float, float]) -> None:
        """Download and normalize one point's hourly forecast series."""
        latitude, longitude = key
        query = urlparse.urlencode(
            {
                "latitude": f"{latitude:.4f}",
                "longitude": f"{longitude:.4f}",
                "hourly": "wind_speed_10m,precipitation,snowfall",
                "timezone": "UTC",
                "forecast_days": str(_FORECAST_DAYS),
            }
        )
        body = self._get(f"{_OPENMETEO_BASE_URL}?{query}")
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise ProviderTransientError("openmeteo: invalid payload") from exc
        self._series[key], self._series_start[key] = _parse_series(payload)


def _parse_series(
    payload: object,
) -> tuple[list[WeatherObservation | None], datetime]:
    """Normalize the hourly arrays to canonical-unit observations."""
    if not isinstance(payload, dict):
        raise ProviderTransientError("openmeteo: invalid payload")
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        raise ProviderTransientError("openmeteo: invalid payload")
    times = hourly.get("time")
    winds = hourly.get("wind_speed_10m")
    rains = hourly.get("precipitation")
    snows = hourly.get("snowfall")
    if (
        not isinstance(times, list)
        or not isinstance(winds, list)
        or not isinstance(rains, list)
        or not isinstance(snows, list)
        or not len(times) == len(winds) == len(rains) == len(snows) > 0
    ):
        raise ProviderTransientError("openmeteo: invalid hourly series")
    try:
        start = datetime.fromisoformat(times[0].replace("Z", "+00:00"))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ProviderTransientError("openmeteo: invalid series time") from exc
    if start.tzinfo is None:
        # timezone=UTC answers carry naive ISO hours; treat them as UTC.
        start = start.replace(tzinfo=UTC)
    observations = [
        _parse_observation(wind, rain, snow, index)
        for index, (wind, rain, snow) in enumerate(
            zip(winds, rains, snows, strict=True)
        )
    ]
    return observations, start


def _parse_observation(
    wind: object, rain: object, snow: object, index: int
) -> WeatherObservation | None:
    """Convert one hourly step (km/h, mm, cm) to canonical units.

    Null values mean the model has no data for that hour: the hour is
    unavailable weather, not a schema violation.
    """
    if wind is None or rain is None or snow is None:
        return None
    measures: list[float] = []
    for name, value in (("wind", wind), ("rain", rain), ("snow", snow)):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not isfinite(value)
        ):
            raise ProviderTransientError(
                f"openmeteo: invalid {name} value at hour {index}"
            )
        measures.append(float(value))
    wind_kmh, rain_mm, snow_cm = measures
    return WeatherObservation(
        wind_mph=max(0.0, wind_kmh / _KMH_PER_MPH),
        rain_inches_per_hour=max(0.0, rain_mm / _MM_PER_INCH),
        snow_inches_per_hour=max(0.0, snow_cm / _CM_PER_INCH),
    )


def _validate_lookup(latitude: float, longitude: float, valid_time: datetime) -> None:
    """Reject non-finite coordinates and naive timestamps (caller errors)."""
    if not isfinite(latitude) or not isfinite(longitude):
        raise ValueError("weather lookup coordinates must be finite")
    if not isinstance(valid_time, datetime):
        raise ValueError("valid_time must be a datetime")
    if valid_time.tzinfo is None or valid_time.utcoffset() is None:
        raise ValueError("valid_time must be timezone-aware")
