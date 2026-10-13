# apps/api/config/settings.py

import os
from pathlib import Path
from typing import Final

from corsheaders.defaults import default_headers as cors_default_headers
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

_DEBUG_TRUE_VALUES: Final[frozenset[str]] = frozenset({"1", "true", "yes", "on"})
_DEBUG_FALSE_VALUES: Final[frozenset[str]] = frozenset({"0", "false", "no", "off"})

_DEVELOPMENT_SECRET_KEY: Final[str] = "django-insecure-development-only"


def _parse_debug(raw: str | None) -> bool:
    """
    Parse DJANGO_DEBUG explicitly instead of coercing with bool().

    An unset or empty variable falls back to True so local development
    works without an .env file. Unrecognized values raise ValueError
    instead of silently becoming False, because bool("false") is True
    and a typo like "ture" must not flip the security posture quietly.
    """
    if raw is None or not raw.strip():
        return True

    normalized = raw.strip().lower()

    if normalized in _DEBUG_TRUE_VALUES:
        return True

    if normalized in _DEBUG_FALSE_VALUES:
        return False

    raise ValueError(
        f"Unrecognized DJANGO_DEBUG value: {raw!r}. "
        "Use one of 1/true/yes/on or 0/false/no/off."
    )


def _parse_allowed_hosts(raw: str | None) -> list[str]:
    """
    Parse ALLOWED_HOSTS from a comma-separated environment value.

    Surrounding whitespace is trimmed and empty entries are ignored, so
    values like "example.com, , api.example.com" behave as expected.
    """
    if raw is None:
        return []

    return [host.strip() for host in raw.split(",") if host.strip()]


def _resolve_secret_key(*, debug: bool, raw: str | None) -> str:
    """
    Resolve the Django secret key from the environment.

    A provided value is always used. Otherwise local development falls
    back to a documented insecure key, while a production-like run with
    DEBUG off fails fast instead of booting with a publicly known key.
    """
    if raw and raw.strip():
        return raw

    if not debug:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false."
        )

    return _DEVELOPMENT_SECRET_KEY


DEBUG: bool = _parse_debug(os.environ.get("DJANGO_DEBUG"))

SECRET_KEY: str = _resolve_secret_key(
    debug=DEBUG, raw=os.environ.get("DJANGO_SECRET_KEY")
)

ALLOWED_HOSTS: list[str] = _parse_allowed_hosts(os.environ.get("ALLOWED_HOSTS"))

# CORS. Empty by default (same-origin only; browsers block cross-origin
# reads). Set CORS_ALLOWED_ORIGINS to a comma-separated list of exact
# origins (e.g. "https://trucksafe.vercel.app") and/or
# CORS_ALLOWED_ORIGIN_REGEXES to comma-separated regexes (e.g.
# "https://[a-z0-9-]+\\.vercel\\.app" for Vercel preview deployments).
# Both use the same tolerant parser as ALLOWED_HOSTS.
CORS_ALLOWED_ORIGINS: list[str] = _parse_allowed_hosts(
    os.environ.get("CORS_ALLOWED_ORIGINS")
)
CORS_ALLOWED_ORIGIN_REGEXES: list[str] = _parse_allowed_hosts(
    os.environ.get("CORS_ALLOWED_ORIGIN_REGEXES")
)

# The frontend sends X-Request-ID for tracing; it must be exposed to the
# browser on top of the django-cors-headers defaults, or preflights fail.
CORS_ALLOW_HEADERS: list[str] = [*cors_default_headers, "x-request-id"]

# Provider selection. ``osrm`` resolves to the road-following OSRM/Photon
# adapter (no credentials); a dotted path selects any custom adapter;
# unset keeps the deterministic mocks. The factory instantiates whatever
# is configured, so no view or service code changes with the provider.
_PROVIDER_ALIASES = {"osrm": "providers.osrm_routing.OsrmRoutingProvider"}


def _resolve_provider(raw: str | None) -> str | None:
    if raw is None or not raw.strip():
        return None
    return _PROVIDER_ALIASES.get(raw.strip().lower(), raw.strip())


TRUCKSAFE_ROUTING_PROVIDER: str | None = _resolve_provider(
    os.environ.get("TRUCKSAFE_ROUTING_PROVIDER")
)
TRUCKSAFE_WEATHER_PROVIDER: str | None = _resolve_provider(
    os.environ.get("TRUCKSAFE_WEATHER_PROVIDER")
)


INSTALLED_APPS = [
    # Django applications
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party applications
    "corsheaders",
    "rest_framework",
    # Local applications
    "health.apps.HealthConfig",
    "risk.apps.RiskConfig",
    "route_plans.apps.RoutePlansConfig",
]


MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CORS headers must be added before CommonMiddleware serves the
    # response (including 304s and preflight short-circuits).
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "route_plans.middleware.RequestIdMiddleware",
]


ROOT_URLCONF = "config.urls"


TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


WSGI_APPLICATION = "config.wsgi.application"


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
