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

    def get_routes(self, origin, destination):
        ...


class WeatherProvider:
    def get_hourly_forecast(
        self,
        latitude: float,
        longitude: float,
        start_at,
        end_at,
    ):
        ...
```

## Responsibilities of Adapters

Adapters must:

- Authenticate requests.
- Apply timeouts.
- Retry transient failures.
- Validate responses.
- Convert units.
- Normalize provider-specific fields.
- Return internal application models.

## Rationale

This approach:

- Makes provider replacement easier.
- Enables reliable automated testing.
- Keeps business logic independent from vendors.
- Allows caching and resilience policies in one place.

## Consequences

The application requires additional adapter and normalization code.

However, this complexity prevents external provider details from leaking into the domain and frontend layers.