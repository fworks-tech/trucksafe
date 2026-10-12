"""Unit tests for request-id propagation and validation."""

from django.http import HttpResponse
from django.test import RequestFactory

from route_plans.middleware import RequestIdMiddleware, is_valid_request_id


def _run_middleware(request_id: str | None) -> HttpResponse:
    """Run the middleware with an optional incoming request id."""
    factory = RequestFactory()
    kwargs = {} if request_id is None else {"HTTP_X_REQUEST_ID": request_id}
    request = factory.get("/", **kwargs)
    return RequestIdMiddleware(lambda req: HttpResponse())(request)


def test_missing_request_id_is_generated() -> None:
    """Requests without an id get a 32-hex server id."""
    response = _run_middleware(None)
    header = response["X-Request-ID"]
    assert len(header) == 32
    assert is_valid_request_id(header)


def test_valid_request_id_is_propagated() -> None:
    """A valid client id echoes back unchanged."""
    response = _run_middleware("plan-1_ABC")
    assert response["X-Request-ID"] == "plan-1_ABC"


def test_max_length_request_id_is_propagated() -> None:
    """A 128-character id is the longest accepted value."""
    response = _run_middleware("a" * 128)
    assert response["X-Request-ID"] == "a" * 128


def test_invalid_request_ids_are_replaced() -> None:
    """Unsafe or overlong ids are replaced with a generated one."""
    for incoming in ("has space", "semi;colon", "line\nbreak", "tab\there", "a" * 129):
        assert not is_valid_request_id(incoming)
        header = _run_middleware(incoming)["X-Request-ID"]
        assert header != incoming
        assert is_valid_request_id(header)
