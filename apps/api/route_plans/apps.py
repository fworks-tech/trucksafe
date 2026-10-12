"""
Django application configuration for route planning.
"""

from django.apps import AppConfig


class RoutePlansConfig(AppConfig):
    """
    Django application configuration for the route-plans API slice.

    The orchestration service in this app wires providers to the
    framework-independent routing and risk domain. Only views,
    serializers, and models depend on Django.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "route_plans"
    verbose_name = "Route Plans"
