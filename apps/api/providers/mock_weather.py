"""Deterministic mock weather provider for development and tests.

Base observations derive from a fixed function of position and time, so
repeated lookups agree. Per-point overrides force specific scenarios
(including unavailable weather), and simulated failures exercise retry
and degradation paths. No network, no credentials, no randomness.
"""

from datetime import datetime
from math import isfinite, radians, sin

from risk.schemas import WeatherObservation

from .errors import ProviderError, ProviderTransientError


def _base_observation(
    latitude: float, longitude: float, valid_time: datetime
) -> WeatherObservation:
    """Derive a plausible fixed observation from position and time."""
    hours = valid_time.timestamp() / 3600.0
    lat, lon = radians(latitude), radians(longitude)
    wind_mph = 14.0 + 9.0 * sin(lat * 3.0 + hours / 12.0) + 4.0 * sin(lon * 2.0)
    rain = max(0.0, 0.08 * sin(lat * 5.0 - hours / 6.0) + 0.05 * sin(lon * 4.0))
    snow = max(0.0, 0.05 * sin(lat * 7.0 + lon * 3.0 - hours / 18.0))
    return WeatherObservation(
        wind_mph=max(0.0, wind_mph),
        rain_inches_per_hour=rain,
        snow_inches_per_hour=snow,
    )


class MockWeatherProvider:
    """WeatherProvider with deterministic mock observations."""

    def __init__(
        self,
        overrides: dict[tuple[float, float], WeatherObservation | None] | None = None,
        always_unavailable: bool = False,
        failure: ProviderError | None = None,
        transient_failures: int = 0,
    ) -> None:
        """Configure scenarios and simulated failures.

        Args:
            overrides: Fixed observations keyed by (lat, lon) rounded to
                4 decimals; a None value forces unavailable weather at
                that point. Overrides are time-independent: the base
                observation still varies with valid_time elsewhere.
            always_unavailable: Return None for every lookup.
            failure: Raised on every call when set; takes precedence over
                transient_failures when both are configured.
            transient_failures: Number of leading calls that raise
                ProviderTransientError before succeeding.
        """
        if transient_failures < 0:
            raise ValueError("transient_failures cannot be negative")
        self._overrides = dict(overrides or {})
        self._always_unavailable = always_unavailable
        self._failure = failure
        self._transient_failures = transient_failures
        self.calls = 0

    def get_weather(
        self, latitude: float, longitude: float, *, valid_time: datetime
    ) -> WeatherObservation | None:
        """Return the deterministic observation, or None when unavailable."""
        self.calls += 1
        if self._failure is not None:
            raise self._failure
        if self._transient_failures > 0:
            self._transient_failures -= 1
            raise ProviderTransientError("mock transient weather failure")
        _validate_lookup(latitude, longitude, valid_time)
        if self._always_unavailable:
            return None
        key = (round(latitude, 4), round(longitude, 4))
        if key in self._overrides:
            return self._overrides[key]
        return _base_observation(latitude, longitude, valid_time)


def _validate_lookup(latitude: float, longitude: float, valid_time: datetime) -> None:
    """Reject non-finite coordinates and naive timestamps (caller errors)."""
    if not isfinite(latitude) or not isfinite(longitude):
        raise ValueError("weather lookup coordinates must be finite")
    if not isinstance(valid_time, datetime):
        raise ValueError("valid_time must be a datetime")
    if valid_time.tzinfo is None or valid_time.utcoffset() is None:
        raise ValueError("valid_time must be timezone-aware")
