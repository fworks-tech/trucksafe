"""
Regression tests for the Django WSGI and ASGI entrypoints.

The settings module references config.wsgi.application, so the WSGI and
ASGI callables must be importable for deployment servers to start.
"""

from config.asgi import application as asgi_application
from config.wsgi import application as wsgi_application


def test_wsgi_application_is_exposed() -> None:
    """
    The WSGI callable must be importable from config.wsgi.
    """
    assert wsgi_application is not None


def test_asgi_application_is_exposed() -> None:
    """
    The ASGI callable must be importable from config.asgi.
    """
    assert asgi_application is not None
