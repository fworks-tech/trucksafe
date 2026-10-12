"""
Django application configuration for operational endpoints.
"""

from django.apps import AppConfig


class HealthConfig(AppConfig):
    """
    Django application configuration for health and readiness probes.

    These views report process and dependency state only; they contain
    no route-planning business logic.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "health"
    verbose_name = "Health"
