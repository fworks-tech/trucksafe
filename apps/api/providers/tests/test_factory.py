"""Unit tests for the provider factories."""

from django.test import override_settings

from providers.factory import get_routing_provider, get_weather_provider
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider


def test_defaults_resolve_to_mocks() -> None:
    """Unset settings yield the deterministic mock providers."""
    assert isinstance(get_routing_provider(), MockRoutingProvider)
    assert isinstance(get_weather_provider(), MockWeatherProvider)


def test_dotted_path_setting_resolves_routing_provider() -> None:
    """A dotted import path setting selects the referenced provider."""
    with override_settings(
        TRUCKSAFE_ROUTING_PROVIDER="providers.mock_routing.MockRoutingProvider"
    ):
        assert isinstance(get_routing_provider(), MockRoutingProvider)


def test_dotted_path_setting_resolves_weather_provider() -> None:
    """A dotted import path setting selects the referenced provider."""
    with override_settings(
        TRUCKSAFE_WEATHER_PROVIDER="providers.mock_weather.MockWeatherProvider"
    ):
        assert isinstance(get_weather_provider(), MockWeatherProvider)


def test_callable_setting_resolves_provider() -> None:
    """A zero-argument callable setting is used as the provider factory."""
    with override_settings(TRUCKSAFE_ROUTING_PROVIDER=lambda: MockRoutingProvider()):
        assert isinstance(get_routing_provider(), MockRoutingProvider)
