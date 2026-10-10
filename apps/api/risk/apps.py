"""
Django application configuration for the risk domain.
"""

from django.apps import AppConfig


class RiskConfig(AppConfig):
    """
    Django application configuration for weather risk classification.

    The risk engine itself does not depend on Django. This configuration class
    only allows Django to discover and register the application.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "risk"
    verbose_name = "Weather Risk"
