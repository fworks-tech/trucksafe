"""HTTP layer for POST /api/v1/route-plans.

Views translate HTTP into service calls and domain results into
responses. Provider errors map to the documented error envelope, and
domain-boundary validation failures (ValueError) map to 400; truly
unexpected exceptions propagate to Django's 500 handling.
"""

import uuid

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_400_BAD_REQUEST,
    HTTP_422_UNPROCESSABLE_ENTITY,
    HTTP_503_SERVICE_UNAVAILABLE,
)
from rest_framework.views import APIView

from providers.errors import ProviderPermanentError, ProviderTransientError
from providers.mock_routing import MockRoutingProvider
from providers.mock_weather import MockWeatherProvider

from .models import RoutePlan
from .serializers import RoutePlanRequestSerializer, build_response
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
        """Validate, plan with mock providers, persist, and return the plan."""
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
                routing_provider=MockRoutingProvider(),
                weather_provider=MockWeatherProvider(),
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
