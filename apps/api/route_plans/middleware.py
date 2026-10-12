"""Per-request identifier propagated to responses and error envelopes.

Behavior:
- A client-provided X-Request-ID header is propagated when valid:
  1 to 128 ASCII letters, digits, hyphens, or underscores.
- A missing or invalid value is replaced with a generated 32-hex id.

The same id is set on the request, echoed in the X-Request-ID response
header, and included in every error envelope built by the views.
"""

import re
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

#: Maximum length accepted for a client-provided request id.
MAX_REQUEST_ID_LENGTH = 128

_REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]+")


def is_valid_request_id(value: object) -> bool:
    """Return whether a client-provided request id is safe to propagate."""
    return (
        isinstance(value, str)
        and 0 < len(value) <= MAX_REQUEST_ID_LENGTH
        and _REQUEST_ID_PATTERN.fullmatch(value) is not None
    )


class RequestIdMiddleware:
    """Attach a request id to every request and response."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        """Store the downstream handler."""
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """Propagate a valid client id, else stamp a generated one."""
        incoming = request.headers.get("X-Request-ID")
        request.request_id = (  # type: ignore[attr-defined]
            incoming if is_valid_request_id(incoming) else uuid.uuid4().hex
        )
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id  # type: ignore[attr-defined]
        return response
