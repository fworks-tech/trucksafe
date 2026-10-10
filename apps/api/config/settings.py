# apps/api/config/settings.py

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_flag(name: str, default: bool) -> bool:
    """
    Read a boolean setting from the environment.

    An unset or empty variable falls back to default so local development
    works without an .env file, while a deployed environment can override it.
    """
    raw = os.environ.get(name)

    if raw is None or not raw.strip():
        return default

    return raw.strip().lower() in {"1", "true", "yes", "on"}


SECRET_KEY: str = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-development-only",
)

DEBUG: bool = _env_flag("DJANGO_DEBUG", True)

ALLOWED_HOSTS: list[str] = [
    host.strip()
    for host in os.environ.get("ALLOWED_HOSTS", "").split(",")
    if host.strip()
]


INSTALLED_APPS = [
    # Django applications
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party applications
    "rest_framework",
    # Local applications
    "risk.apps.RiskConfig",
]


MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
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
