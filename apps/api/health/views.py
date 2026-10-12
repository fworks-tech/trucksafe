"""HTTP layer for GET /api/v1/health and GET /api/v1/ready.

Health is a shallow liveness probe: it touches no database and no
providers. Readiness reports per-dependency state and returns 503 when
anything required is unavailable. Neither response carries secrets,
payloads, or stack traces.
"""

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_503_SERVICE_UNAVAILABLE
from rest_framework.views import APIView

from .checks import (
    check_database,
    check_routing_provider,
    check_weather_provider,
)


class HealthView(APIView):
    """Liveness probe for the running application."""

    def get(self, request: Request) -> Response:
        """Return 200 without touching databases or providers."""
        return Response({"status": "ok"}, status=HTTP_200_OK)


class ReadyView(APIView):
    """Readiness probe for route-planning dependencies."""

    def get(self, request: Request) -> Response:
        """Return 200 when ready, 503 with per-check state otherwise."""
        results = (
            check_database(),
            check_routing_provider(),
            check_weather_provider(),
        )
        checks = {
            result.name: "ok" if result.ok else "unavailable" for result in results
        }
        if all(result.ok for result in results):
            return Response({"status": "ready", "checks": checks}, status=HTTP_200_OK)
        return Response(
            {"status": "not_ready", "checks": checks},
            status=HTTP_503_SERVICE_UNAVAILABLE,
        )
