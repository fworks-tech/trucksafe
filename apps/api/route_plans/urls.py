"""URL routes for the route-plans API slice."""

from django.urls import path

from .views import RoutePlanCreateView

urlpatterns = [
    path("route-plans", RoutePlanCreateView.as_view()),
    path("route-plans/", RoutePlanCreateView.as_view()),
]
