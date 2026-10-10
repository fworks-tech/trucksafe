"""
Unit tests for environment-driven Django settings parsing.

DJANGO_DEBUG is parsed explicitly because bool("false") is True, and the
secret key must fail fast outside debug mode instead of silently using a
publicly known development key.
"""

import pytest
from django.core.exceptions import ImproperlyConfigured

from config.settings import (
    _DEVELOPMENT_SECRET_KEY,
    _parse_allowed_hosts,
    _parse_debug,
    _resolve_secret_key,
)


@pytest.mark.parametrize(
    "raw",
    ["1", "true", "True", "TRUE", " yes ", "on", "ON"],
)
def test_debug_accepts_true_representations(raw: str) -> None:
    """
    Documented truthy spellings, including padded ones, enable debug mode.
    """
    assert _parse_debug(raw) is True


@pytest.mark.parametrize(
    "raw",
    ["0", "false", "False", "FALSE", " no ", "off", "OFF"],
)
def test_debug_accepts_false_representations(raw: str) -> None:
    """
    Documented falsy spellings, including padded ones, disable debug mode.
    """
    assert _parse_debug(raw) is False


@pytest.mark.parametrize("raw", [None, "", "   "])
def test_debug_defaults_to_true_when_unset_or_empty(raw: str | None) -> None:
    """
    Local development works without an .env file.
    """
    assert _parse_debug(raw) is True


@pytest.mark.parametrize("raw", ["banana", "2", "truthy", "falsey", "yes please"])
def test_debug_rejects_unrecognized_values(raw: str) -> None:
    """
    Typos must surface loudly instead of silently flipping debug mode.
    """
    with pytest.raises(ValueError, match="DJANGO_DEBUG"):
        _parse_debug(raw)


def test_allowed_hosts_trims_whitespace_and_ignores_empty_entries() -> None:
    """
    Common comma-separated values with stray spaces parse as expected.
    """
    assert _parse_allowed_hosts("example.com,  , api.example.com ,,") == [
        "example.com",
        "api.example.com",
    ]


@pytest.mark.parametrize("raw", [None, "", "   ", ",,,"])
def test_allowed_hosts_defaults_to_empty(raw: str | None) -> None:
    """
    No configured hosts means an empty allowlist.
    """
    assert _parse_allowed_hosts(raw) == []


def test_secret_key_uses_provided_value() -> None:
    """
    An explicit key is always used, even outside debug mode.
    """
    assert _resolve_secret_key(debug=False, raw="s3cr3t") == "s3cr3t"


def test_secret_key_falls_back_to_documented_key_in_debug_mode() -> None:
    """
    Local development boots without any environment configuration.
    """
    assert _resolve_secret_key(debug=True, raw=None) == _DEVELOPMENT_SECRET_KEY


@pytest.mark.parametrize("raw", [None, "", "   "])
def test_secret_key_fails_fast_outside_debug_mode(raw: str | None) -> None:
    """
    A production-like run without a key must not boot with a known key.
    """
    with pytest.raises(ImproperlyConfigured, match="DJANGO_SECRET_KEY"):
        _resolve_secret_key(debug=False, raw=raw)
