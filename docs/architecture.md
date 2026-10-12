# Architecture

## Overview

Weather-Aware Truck Routing is a full-stack application that helps truck drivers compare route alternatives based on weather conditions, truck load weight, risk levels, and travel time.

The application is composed of:

- A React frontend for user interaction and map visualization.
- A Django REST API for orchestration and business logic.
- A routing provider for geocoding and route generation.
- A weather provider for hourly forecasts.
- PostgreSQL for persistent data.
- Redis for caching and background processing.

## High-Level Architecture

```text
React Web Application
        |
        | HTTPS / JSON
        v
Django REST API
        |
        +--------------------+
        |                    |
        v                    v
PostgreSQL              Redis
        |                    |
        |                    v
        |              Background Jobs
        |
        +--------------------------+
        |                          |
        v                          v
Routing Provider             Weather Provider
```

## Main Application Flow

1. The user enters an origin, destination, departure date/time, and load weight.
2. The frontend validates the form data.
3. The backend validates the request again.
4. The backend geocodes the origin and destination.
5. The routing provider returns up to three route alternatives.
6. The backend generates checkpoints along each route.
7. The estimated arrival time is calculated for each checkpoint.
8. Weather conditions are retrieved for each checkpoint and ETA.
9. Weather risk and load-specific rules are applied.
10. Route metrics are calculated.
11. Routes are ranked according to the recommendation rules.
12. The frontend displays the routes, checkpoints, weather data, and heatmap.

## Architectural Boundaries

### Frontend

The frontend is responsible for:

- Rendering the user interface.
- Form state and client-side validation.
- Calling the backend API.
- Rendering maps and route geometries.
- Displaying loading, error, and empty states.
- Managing the forecast slider.

The frontend must not contain provider secrets or authoritative business rules.

### Backend

The backend is responsible for:

- Request validation.
- External API orchestration.
- Route normalization.
- Checkpoint generation.
- ETA calculation.
- Weather normalization.
- Risk classification.
- Route recommendation.
- Persistence and caching.
- Consistent API error handling.

### Domain Layer

Risk classification and route recommendation should remain independent of Django, HTTP clients, and database implementation.

This makes the most important business rules easy to test and reuse.

## External Provider Adapters

External integrations must be isolated behind provider interfaces.

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

Provider adapters are resolved through small factories
(`providers/factory.py`): the deterministic mocks by default, or a
dotted import path / callable from `settings.TRUCKSAFE_ROUTING_PROVIDER`
and `settings.TRUCKSAFE_WEATHER_PROVIDER` for real adapters later.
Views and readiness checks share this seam, so there is exactly one
wiring path. Adapters are responsible for:

- Authentication (real adapters; mocks use none).
- HTTP requests (real adapters; mocks perform no I/O).
- Timeouts (real adapters).
- Retries for transient errors (bounded immediate retry today; backoff with real adapters).
- Response validation.
- Unit conversion (real adapters; mocks are already canonical).
- Mapping provider-specific fields to internal models.

## Internal Units

The application uses the following canonical units:

| Value | Internal Unit |
|---|---|
| Distance | Miles |
| Wind speed | Miles per hour |
| Rain | Inches per hour |
| Snow | Inches per hour |
| Load weight | Pounds |
| Duration | Seconds |
| Coordinates | WGS84 |
| Timestamps | UTC |

## Persistence

The system persists:

- Computed route plans (`route_plans.RoutePlan`, keyed by deterministic
  plan id; see ADR-004). Only successful plans are stored.

It may later persist:

- Route planning requests.
- Route alternatives.
- Checkpoints.
- Weather observations.
- Recommendation metrics.

External API responses should be cached to reduce latency and provider usage.

## Reliability

The application implements:

- Retry with bounded attempts for transient failures (no backoff yet).
- Response schema validation.
- Structured error responses.
- Request correlation IDs (valid client ids propagated, else generated).
- Health (`GET /api/v1/health`, shallow liveness) and readiness
  (`GET /api/v1/ready`, per-dependency `200`/`503`) probes in the
  `health/` app, which holds no route-planning logic. Provider checks
  verify factory wiring, not external reachability, while mocks are in
  use.

Still planned:

- Provider timeouts.
- Exponential backoff.
- Cache expiration.

## Performance Considerations

- Route geometries should be rendered using map layers rather than one UI component per coordinate.
- Weather requests should be cached.
- The frontend should avoid recreating the map instance when only the selected route or forecast hour changes.
- Heatmap data should be loaded and updated independently from the route data.
- The forecast slider should use debouncing when it triggers network requests.

## Security Considerations

- Private provider API keys must remain server-side.
- CORS must only allow trusted frontend origins.
- User input must be validated on both frontend and backend.
- Rate limiting should be applied to route planning endpoints.
- Error responses must not expose stack traces or credentials.