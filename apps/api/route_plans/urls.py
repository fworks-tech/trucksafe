"""URL routes for the route-plans API slice."""

from django.urls import path

from .views import RoutePlanCreateView, RoutePlanDetailView, WeatherGridView

urlpatterns = [
    path("route-plans", RoutePlanCreateView.as_view()),
    path("route-plans/", RoutePlanCreateView.as_view()),
    path("route-plans/<str:route_plan_id>", RoutePlanDetailView.as_view()),
    path("route-plans/<str:route_plan_id>/", RoutePlanDetailView.as_view()),
    path("route-plans/<str:route_plan_id>/weather-grid", WeatherGridView.as_view()),
    path("route-plans/<str:route_plan_id>/weather-grid/", WeatherGridView.as_view()),
]
