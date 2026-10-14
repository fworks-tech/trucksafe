# API Documentation

## Base URL

```text
/api/v1
```

## Response Format

Successful responses return JSON.

`400`, `422`, and `503` errors use the following structure:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request contains invalid data.",
    "request_id": "request-id"
  }
}
```

The `request_id` matches the `X-Request-ID` response header (see Request IDs).
Malformed JSON bodies are rejected by request parsing with a `400` response
before validation runs.

## Create a Route Plan

```http
POST /route-plans
Content-Type: application/json
```

Plans three route alternatives for a truck trip, classifies weather risk
per checkpoint, and recommends the best eligible route.

### Request

```json
{
  "origin": {"address": "Denver, CO"},
  "destination": {"latitude": 39.0997, "longitude": -94.5786},
  "departure_at": "2026-10-09T14:00:00Z",
  "load_weight_lb": 35000,
  "checkpoint_interval_miles": 25
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---:|---|
| `origin` | object | Yes | `{"address": string}` or `{"latitude": number, "longitude": number}` |
| `destination` | object | Yes | Same two forms as `origin` |
| `departure_at` | string | Yes | ISO 8601 timestamp with timezone; normalized to UTC |
| `load_weight_lb` | number | Yes | Finite truck load weight in pounds, `>= 0` |
| `checkpoint_interval_miles` | number | No | `10`, `25`, or `50`; defaults to `25` |

Endpoint rules: exactly one of `address` or coordinates per endpoint;
addresses are non-blank, at most 200 characters; coordinates must be
finite WGS84 values. Naive timestamps (no timezone designator) are
rejected. Non-finite JSON numbers (`NaN`, `Infinity`) are rejected by
JSON parsing with `400` before validation.

### Response

`201 Created` for a newly computed plan, `200 OK` when an equivalent
request repeats (same deterministic plan id, stored payload returned).

```json
{
  "id": "route-plan-id",
  "status": "completed",
  "routing_provider": "mock",
  "mock_mode": true,
  "recommended_route_id": "route-1",
  "recommendation_reason": {
    "code": "LOWEST_RISK_RANKING",
    "message": "Selected using the deterministic route ranking criteria.",
    "ranking_key": [0.0, 10.0, 1.8, 7200.0],
    "criteria": ["severe_miles", "high_miles", "average_risk_score", "duration_seconds"]
  },
  "warnings": [],
  "routes": [
    {
      "id": "route-1",
      "distance_miles": 604.2,
      "duration_seconds": 32400.0,
      "is_eligible": true,
      "is_recommended": true,
      "recommendation_rank": 1,
      "severe_miles": 0.0,
      "high_miles": 28.4,
      "no_travel_miles": 0.0,
      "average_risk_score": 1.42,
      "geometry": {
        "type": "LineString",
        "coordinates": [[-104.9903, 39.7392], [-104.8, 39.6], [-104.5, 39.4]]
      },
      "risk_segments": [
        {
          "start_index": 0,
          "end_index": 1,
          "risk_level": "LOW",
          "risk_score": 1.0,
          "risk_reasons": ["wind 12 mph"]
        },
        {
          "start_index": 1,
          "end_index": 2,
          "risk_level": "HIGH",
          "risk_score": 3.0,
          "risk_reasons": ["wind 38 mph", "rain 0.3 in/h"]
        }
      ],
      "checkpoints": [
        {
          "sequence": 1,
          "checkpoint_id": "cp-1",
          "distance_miles": 0.0,
          "latitude": 39.7392,
          "longitude": -104.9903,
          "eta": "2026-10-09T14:00:00Z",
          "weather_available": true,
          "risk_level": "LOW",
          "risk_score": 1.0,
          "risk_reasons": ["wind 12 mph"]
        }
      ]
    }
  ]
}
```

Response notes:

- Exactly three routes are always returned, in provider order, each with
  `recommendation_rank` over all routes.
- `risk_segments` is optional and additive. When present it carries one
  entry per route segment between consecutive checkpoints, in origin to
  destination order, referencing `geometry.coordinates` by
  `start_index`/`end_index` (inclusive). The geometry returned alongside
  it is enriched so every checkpoint sits on a vertex; the frontend
  slices `coordinates` between those indices to color the segment.
  Omit `risk_segments` (or return `[]`) and clients fall back to
  route-level coloring, so older and newer responses both stay valid.
- A segment inherits the risk of the checkpoint at its end, matching how
  `severe_miles`/`high_miles` are attributed. When weather is
  unavailable for that checkpoint, `risk_level` is `null` and
  `risk_score` is `null` — never a fabricated Low. Segments are
  all-or-nothing per route: any index mismatch omits the whole array for
  that route rather than shipping partial risk.
- Checkpoint ETAs are UTC ISO 8601 with a `Z` suffix.
- `weather_available: false` means no observation existed for that
  checkpoint; `risk_level` is then `null` and the route is ineligible.
  Missing weather is never reported as safe.
- `risk_score` follows the risk scale Low 1 … No Travel 5.
- When every route is ineligible, `recommended_route_id` and
  `recommendation_reason` are both `null` and `warnings` explains why.
- `ranking_key` is the exact
  `(severe_miles, high_miles, average_risk_score, duration_seconds)`
  tuple of the selected route; lower wins every field. Eligible routes
  always rank before ineligible ones.
- Transient provider failures are retried up to 3 total attempts with no
  delay; permanent failures are never retried. There is no exponential
  backoff in this slice.
- Routing, geocoding, and weather currently come from deterministic
  mock providers. Mock data must never be presented as live weather.
- `routing_provider` names the adapter that produced the geometry
  (`"mock"`, `"osrm"`, or a custom dotted path's `provider_name`).
  `mock_mode` is `true` when the geometry is deterministic demonstration
  data (straight corridors, not roads); the response then also carries a
  `"mock routing provider in use"` warning, and clients must show a
  visible banner. There is no silent fallback: when `osrm` is configured
  and fails, the API returns `422`/`503` instead of mock geometry.

## Health

```http
GET /health
```

Shallow liveness probe. Returns `200` with `{"status": "ok"}` when the
application is running. It touches no database and no providers, and
writes nothing. Every response still carries `X-Request-ID`.

## Readiness

```http
GET /ready
```

Readiness for route-planning requests. Returns `200` when every
required dependency is available:

```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "routing_provider": "ok",
    "weather_provider": "ok"
  }
}
```

Returns `503` with `"status": "not_ready"` and the failing check named
`"unavailable"` when any required dependency is down. Example:

```json
{
  "status": "not_ready",
  "checks": {
    "database": "ok",
    "routing_provider": "unavailable",
    "weather_provider": "ok"
  }
}
```

Checks performed:

- `database`: the default database accepts a connection (read-only,
  no writes).
- `routing_provider` / `weather_provider`: the configured provider
  factory resolves to an adapter implementing the provider protocol.

Default providers are deterministic mocks with no network or
credentials, so with unset provider settings the checks verify wiring
and configuration — not external reachability. A dotted import path or
callable in `settings.TRUCKSAFE_ROUTING_PROVIDER` /
`TRUCKSAFE_WEATHER_PROVIDER` selects a real adapter (`osrm` for
road-following routing, `openmeteo` for forecast weather); an
unresolvable value reports that provider `unavailable` instead of
raising. Those settings are deployer-controlled server-side
configuration: they are never read from request data, and module paths
or exception details never appear in responses. Failure responses never include stack traces, credentials,
provider payloads, or connection details.

Health and readiness have different semantics and are not aliases:
`/health` answers "is the process running", `/ready` answers "can it
plan routes right now".

## Request IDs

Every response carries an `X-Request-ID` header, and every error
envelope carries the same id in `error.request_id`.

- If the request sends a valid `X-Request-ID`, it is propagated.
- Valid ids are 1–128 ASCII letters, digits, hyphens, or underscores.
- A missing or invalid id is replaced with a generated 32-character hex
  id. Invalid values are never reflected, so header injection is not
  possible.

## Status Codes and Error Codes

| Status | Error code | Meaning |
|---:|---|---|
| `201` | — | Plan created |
| `200` | — | Equivalent repeated request; stored plan returned |
| `400` | `INVALID_REQUEST` | Validation or domain-boundary failure (bad fields, naive timestamp, out-of-range coordinates, invalid route data) |
| `422` | `UNROUTABLE` | Permanent provider failure (for example identical origin and destination) |
| `503` | `PROVIDER_UNAVAILABLE` | Transient provider failures exhausted after retries |

Unexpected server errors use Django's default `500` handling and never
include stack traces, provider payloads, or credentials in responses.

## Validation Rules

The backend validates:

- Origin and destination are present, in exactly one accepted form.
- Addresses are non-blank and at most 200 characters.
- Coordinates are finite WGS84 values.
- Departure time is a valid ISO 8601 timestamp with a timezone.
- Load weight is finite and non-negative.
- Checkpoint interval is `10`, `25`, or `50`.
- Provider response structures match the expected schema before use.

## Weather Grid

```http
GET /route-plans/{route_plan_id}/weather-grid?offset_hours={0..48}
```

Retrieves the weather risk grid for a route plan at a specific forecast
offset from departure.

### Request

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `route_plan_id` | string | Yes | Route plan identifier from the route plan response. |
| `offset_hours` | integer | Yes | Forecast offset in hours from departure. Range `0` to `48`. |

### Response

`200 OK` with the weather grid payload.

```json
{
  "route_id": "route-1",
  "route_plan_id": "plan-abc123",
  "forecast_start": "2026-10-09T14:00:00Z",
  "forecast_end": "2026-10-09T15:00:00Z",
  "cells": [
    {
      "cell_id": "cell-route-1-0",
      "latitude": 39.7392,
      "longitude": -104.9903,
      "valid_at": "2026-10-09T14:00:00Z",
      "risk_level": "LOW",
      "risk_score": 1.0,
      "risk_reasons": ["wind 15.2 mph"],
      "weather": {
        "wind_mph": 15.2,
        "rain_inches_per_hour": 0.02,
        "snow_inches_per_hour": 0.0
      }
    }
  ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `route_id` | string | Route identifier within the plan. |
| `route_plan_id` | string | Route plan identifier. |
| `forecast_start` | string | Forecast window start (UTC, ISO 8601 with `Z`). |
| `forecast_end` | string | Forecast window end (UTC, ISO 8601 with `Z`). |
| `cells` | array | Grid cells along the route corridor. |

#### Cell Fields

| Field | Type | Description |
|---|---|---|
| `cell_id` | string | Stable cell identifier. |
| `latitude` | number | WGS84 latitude. |
| `longitude` | number | WGS84 longitude. |
| `valid_at` | string | Forecast validity timestamp (UTC, ISO 8601 with `Z`). |
| `risk_level` | string \| null | `LOW`, `MODERATE`, `HIGH`, `SEVERE`, `NO_TRAVEL`, or `null` when unavailable. |
| `risk_score` | number \| null | Numeric risk score 1–5, or `null` when unavailable. |
| `risk_reasons` | string[] | Human-readable reasons for the risk classification. |
| `weather` | object \| null | Raw weather values when available; `null` when unavailable. |

##### Weather Object Fields

| Field | Type | Unit | Description |
|---|---|---|---|
| `wind_mph` | number | mph | Wind speed. |
| `rain_inches_per_hour` | number | in/hr | Rain intensity. |
| `snow_inches_per_hour` | number | in/hr | Snow intensity. |

### Error Responses

| Status | Error code | Meaning |
|---|---|---|
| `400` | `INVALID_REQUEST` | Missing or invalid `offset_hours` (must be integer 0–48). |
| `404` | `NOT_FOUND` | Route plan not found. |
| `422` | `UNROUTABLE` | Permanent weather provider failure. |
| `503` | `PROVIDER_UNAVAILABLE` | Transient weather provider failures exhausted after retries. |

### Behavior

- The grid samples weather at each route checkpoint position for the
  forecast hour `departure_at + offset_hours` (departure truncated to the
  hour). Checkpoint ETAs drive the plan-time sampling on `POST
  /route-plans`; the grid is the offset-based forecast view on top.
- Cells with unavailable weather have `risk_level: null`, `risk_score: null`,
  empty `risk_reasons`, and `weather: null`.
- The grid is deterministic for the same inputs.
- Repeated requests for the same plan and offset return identical cells.
- The forecast window is one hour (`forecast_end = forecast_start + 1 hour`).
- Maximum forecast horizon is 48 hours from departure.

## Health

...
