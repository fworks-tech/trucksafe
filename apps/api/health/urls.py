"""URL routes for the health and readiness probes."""

from django.urls import path

from .views import HealthView, ReadyView

urlpatterns = [
    path("health", HealthView.as_view()),
    path("health/", HealthView.as_view()),
    path("ready", ReadyView.as_view()),
    path("ready/", ReadyView.as_view()),
]
