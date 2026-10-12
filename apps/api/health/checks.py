"""Readiness checks for the TruckSafe API.

Each check returns a small ``CheckResult`` instead of raising, so the
readiness view can report per-dependency state with a stable shape.
Checks never perform network calls: with the deterministic mock
providers, "available" means the configured factory resolves to a
provider implementing the expected protocol.
"""

from collections.abc import Callable
from dataclasses import dataclass

from django.db import connection

from providers.factory import get_routing_provider, get_weather_provider
from providers.protocols import RoutingProvider, WeatherProvider


@dataclass(frozen=True, slots=True)
class CheckResult:
    """Outcome of one readiness probe."""

    name: str
    ok: bool


def check_database() -> CheckResult:
    """Verify the default database accepts a connection (read-only)."""
    try:
        connection.ensure_connection()
    except Exception:
        return CheckResult(name="database", ok=False)
    return CheckResult(name="database", ok=True)


def check_routing_provider(
    factory: Callable[[], RoutingProvider] | None = None,
) -> CheckResult:
    """Verify the configured routing provider resolves to the protocol."""
    return _check_provider("routing_provider", factory or get_routing_provider)


def check_weather_provider(
    factory: Callable[[], WeatherProvider] | None = None,
) -> CheckResult:
    """Verify the configured weather provider resolves to the protocol."""
    return _check_provider("weather_provider", factory or get_weather_provider)


def _check_provider(name: str, factory: Callable[[], object]) -> CheckResult:
    """Resolve one provider factory without network calls or leaks."""
    try:
        provider = factory()
    except Exception:
        return CheckResult(name=name, ok=False)
    if not isinstance(provider, (RoutingProvider, WeatherProvider)):
        return CheckResult(name=name, ok=False)
    return CheckResult(name=name, ok=True)
