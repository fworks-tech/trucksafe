"""Factories resolving the configured routing and weather providers.

Defaults are the deterministic mocks (no network, no credentials). A
dotted import path or zero-argument callable in
``settings.TRUCKSAFE_ROUTING_PROVIDER`` / ``settings.TRUCKSAFE_WEATHER_PROVIDER``
selects a real adapter later without touching views or readiness checks.
"""

from collections.abc import Callable
from typing import cast

from django.conf import settings
from django.utils.module_loading import import_string

from .mock_routing import MockRoutingProvider
from .mock_weather import MockWeatherProvider
from .protocols import RoutingProvider, WeatherProvider


def get_routing_provider() -> RoutingProvider:
    """Return the configured routing provider (mock by default)."""
    return cast(
        RoutingProvider,
        _build(
            getattr(settings, "TRUCKSAFE_ROUTING_PROVIDER", None),
            MockRoutingProvider,
        ),
    )


def get_weather_provider() -> WeatherProvider:
    """Return the configured weather provider (mock by default)."""
    return cast(
        WeatherProvider,
        _build(
            getattr(settings, "TRUCKSAFE_WEATHER_PROVIDER", None),
            MockWeatherProvider,
        ),
    )


def _build(
    configured: str | Callable[[], object] | None,
    default: Callable[[], object],
) -> object:
    """Instantiate the default or the configured provider factory."""
    if configured is None:
        return default()
    factory = import_string(configured) if isinstance(configured, str) else configured
    return factory()
