"""HTTP layer for POST /api/v1/route-plans.

Views translate HTTP into service calls and domain results into
responses. Provider errors map to the documented error envelope, and
domain-boundary validation failures (ValueError) map to 400; truly
unexpected exceptions propagate to Django's 500 handling.
"""

import uuid

from django.db import transaction
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
    HTTP_422_UNPROCESSABLE_ENTITY,
    HTTP_503_SERVICE_UNAVAILABLE,
)
from rest_framework.views import APIView

from providers.errors import ProviderPermanentError, ProviderTransientError
from providers.factory import get_routing_provider, get_weather_provider
from routing.checkpoints import Coordinate
from routing.weather_grid import build_weather_grid

from .models import RoutePlan
from .serializers import (
    RoutePlanRequestSerializer,
    build_response,
    build_weather_grid_response,
)
from .services import plan_route_plan


def error_response(code: str, message: str, status: int, request_id: str) -> Response:
    """Build the standard {"error": {"code", "message", "request_id"}} body."""
    return Response(
        {"error": {"code": code, "message": message, "request_id": request_id}},
        status=status,
    )


def first_error_message(errors: dict) -> str:
    """Extract the first human-readable message from serializer errors."""
    field, messages = next(iter(errors.items()))
    detail = messages[0] if isinstance(messages, list) else messages
    return f"{field}: {detail}"


class RoutePlanCreateView(APIView):
    """Create a route plan from origin, destination, departure, and load."""

    def post(self, request: Request) -> Response:
        """Validate, plan with configured providers, persist, return the plan."""
        request_id = getattr(request, "request_id", uuid.uuid4().hex)
        try:
            serializer = RoutePlanRequestSerializer(data=request.data)
            if not serializer.is_valid():
                return error_response(
                    "INVALID_REQUEST",
                    first_error_message(serializer.errors),
                    HTTP_400_BAD_REQUEST,
                    request_id,
                )
            validated = serializer.validated_data
            result = plan_route_plan(
                origin=validated["origin"],
                destination=validated["destination"],
                departure_at=validated["departure_at"],
                load_weight_lb=validated["load_weight_lb"],
                checkpoint_interval_miles=float(validated["checkpoint_interval_miles"]),
                routing_provider=get_routing_provider(),
                weather_provider=get_weather_provider(),
            )
        except ProviderPermanentError as exc:
            return error_response(
                "UNROUTABLE",
                f"No route could be planned: {exc}",
                HTTP_422_UNPROCESSABLE_ENTITY,
                request_id,
            )
        except ProviderTransientError as exc:
            return error_response(
                "PROVIDER_UNAVAILABLE",
                f"Routing or weather providers are unavailable: {exc}",
                HTTP_503_SERVICE_UNAVAILABLE,
                request_id,
            )
        except ValueError as exc:
            return error_response(
                "INVALID_REQUEST",
                f"Invalid route data: {exc}",
                HTTP_400_BAD_REQUEST,
                request_id,
            )
        payload = build_response(result)
        with transaction.atomic():
            plan, created = RoutePlan.objects.get_or_create(
                plan_id=result.plan_id,
                defaults={
                    "origin": request.data.get("origin"),
                    "destination": request.data.get("destination"),
                    "departure_at": validated["departure_at"],
                    "load_weight_lb": validated["load_weight_lb"],
                    "checkpoint_interval_miles": float(
                        validated["checkpoint_interval_miles"]
                    ),
                    "recommended_route_id": result.recommendation.recommended_route_id,
                    "response": payload,
                },
            )
        return Response(
            plan.response if not created else payload,
            status=HTTP_201_CREATED if created else HTTP_200_OK,
        )


class WeatherGridView(APIView):
    """Retrieve the weather grid for a route plan at a forecast offset."""

    def get(self, request: Request, route_plan_id: str) -> Response:
        """Return the weather grid for the given route plan and offset."""
        request_id = getattr(request, "request_id", uuid.uuid4().hex)

        try:
            plan = RoutePlan.objects.get(plan_id=route_plan_id)
        except RoutePlan.DoesNotExist:
            return error_response(
                "NOT_FOUND",
                f"Route plan {route_plan_id} not found",
                HTTP_404_NOT_FOUND,
                request_id,
            )

        # Parse and validate offset_hours query parameter
        offset_param = request.query_params.get("offset_hours")
        if offset_param is None:
            return error_response(
                "INVALID_REQUEST",
                "Missing required query parameter: offset_hours",
                HTTP_400_BAD_REQUEST,
                request_id,
            )
        try:
            offset_hours = int(offset_param)
        except ValueError:
            return error_response(
                "INVALID_REQUEST",
                "offset_hours must be an integer",
                HTTP_400_BAD_REQUEST,
                request_id,
            )
        if not 0 <= offset_hours <= 48:
            return error_response(
                "INVALID_REQUEST",
                "offset_hours must be in range 0..48",
                HTTP_400_BAD_REQUEST,
                request_id,
            )

        # Reconstruct the route from stored response to get checkpoints and load weight
        # The stored response has the full route data including checkpoints
        response_data = plan.response
        if not response_data or "routes" not in response_data:
            return error_response(
                "INVALID_REQUEST",
                "Route plan data is incomplete",
                HTTP_400_BAD_REQUEST,
                request_id,
            )

        try:
            # Get the route geometry and checkpoints from the first route
            # (all routes share the same checkpoints in our deterministic mock)
            route_data = response_data["routes"][0]
            load_weight_lb = plan.load_weight_lb
            departure_at = plan.departure_at

            # Reconstruct checkpoints from route data
            checkpoints = []
            for cp_data in route_data["checkpoints"]:
                checkpoints.append(
                    Coordinate(
                        latitude=cp_data["latitude"],
                        longitude=cp_data["longitude"],
                    )
                )

            weather_provider = get_weather_provider()
            grid = build_weather_grid(
                route_plan_id=route_plan_id,
                route_id=route_data["id"],
                checkpoints=tuple(checkpoints),
                departure_at=departure_at,
                load_weight_lb=load_weight_lb,
                offset_hours=offset_hours,
                weather_provider=weather_provider,
            )

        except (KeyError, IndexError, TypeError, ValueError) as exc:
            return error_response(
                "INVALID_REQUEST",
                f"Failed to build weather grid: {exc}",
                HTTP_400_BAD_REQUEST,
                request_id,
            )
        except ProviderPermanentError as exc:
            return error_response(
                "UNROUTABLE",
                f"Weather provider permanent error: {exc}",
                HTTP_422_UNPROCESSABLE_ENTITY,
                request_id,
            )
        except ProviderTransientError as exc:
            return error_response(
                "PROVIDER_UNAVAILABLE",
                f"Weather provider temporarily unavailable: {exc}",
                HTTP_503_SERVICE_UNAVAILABLE,
                request_id,
            )

        payload = build_weather_grid_response(grid)
        return Response(payload, status=HTTP_200_OK)
