# ADR-002: External Routing and Weather Providers

## Status

Accepted

## Context

The application must generate route alternatives and retrieve weather forecasts without implementing its own routing or weather engine.

## Decision

Use provider adapters for routing, geocoding, and weather.

The application domain must not depend directly on a specific provider response format.

```python
class RoutingProvider:
    def geocode(self, address: str):
        ...

    def plan_routes(self, request):
        ...


class WeatherProvider:
    def get_weather(
        self,
        latitude: float,
        longitude: float,
        *,
        valid_time,
    ):
        ...
```

`plan_routes` returns exactly three normalized route geometries;
`get_weather` returns one normalized observation, or `None` when weather
is unavailable.

## Responsibilities of Adapters

Real adapters must:

- Authenticate requests.
- Apply timeouts.
- Retry transient failures with backoff.
- Validate responses.
- Convert units.
- Normalize provider-specific fields.
- Return internal application models.

The current deterministic mocks implement the same protocols without I/O:
no auth, timeouts, backoff, or unit conversion. They validate normalized
data at the protocol boundary, retry transient failures without delay,
and never require credentials.

## Rationale

This approach:

- Makes provider replacement easier.
- Enables reliable automated testing.
- Keeps business logic independent from vendors.
- Allows caching and resilience policies in one place.

## Consequences

The application requires additional adapter and normalization code.

However, this complexity prevents external provider details from leaking into the domain and frontend layers.