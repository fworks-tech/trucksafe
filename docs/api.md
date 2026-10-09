# API Documentation

## Base URL

```text
/api/v1
```

## Response Format

Successful responses return JSON.

Errors use the following structure:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request contains invalid data.",
    "request_id": "request-id"
  }
}
```

## Create a Route Plan

```http
POST /route-plans
Content-Type: application/json
```

### Request

```json
{
  "origin": "Denver, CO",
  "destination": "Kansas City, MO",
  "departure_at": "2026-10-09T14:00:00Z",
  "load_weight_lb": 35000,
  "checkpoint_interval_miles": 25
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---:|---|
| `origin` | string | Yes | Origin address or place name |
| `destination` | string | Yes | Destination address or place name |
| `departure_at` | string | Yes | ISO 8601 timestamp |
| `load_weight_lb` | number | Yes | Truck load weight in pounds |
| `checkpoint_interval_miles` | number | No | `10`, `25`, or `50` |

### Response

```json
{
  "id": "route-plan-id",
  "status": "completed",
  "recommended_route_id": "route-id",
  "routes": [
    {
      "id": "route-id",
      "name": "Route 1",
      "distance_miles": 604.2,
      "duration_seconds": 32400,
      "summary": "Primary route",
      "geometry": {
        "type": "LineString",
        "coordinates": []
      },
      "is_recommended": true,
      "recommendation_rank": 1,
      "metrics": {
        "severe_miles": 0,
        "high_miles": 28.4,
        "average_risk_score": 1.42
      },
      "checkpoints": [
        {
          "sequence": 1,
          "distance_miles": 25,
          "latitude": 39.7392,
          "longitude": -104.9903,
          "eta": "2026-10-09T15:20:00Z",
          "risk_level": "LOW",
          "risk_score": 1,
          "risk_reasons": ["wind"]
        }
      ]
    }
  ]
}
```

## Retrieve a Route Plan

```http
GET /route-plans/{route_plan_id}
```

The endpoint returns the current route planning status and result.

Possible statuses:

```text
pending
processing
completed
failed
```

## Retrieve Weather Grid

```http
GET /route-plans/{route_plan_id}/weather-grid?offset_hours=12
```

### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `offset_hours` | integer | Forecast offset from `0` to `48` |

### Response

```json
{
  "route_plan_id": "route-plan-id",
  "offset_hours": 12,
  "points": [
    {
      "latitude": 39.7392,
      "longitude": -104.9903,
      "valid_at": "2026-10-10T02:00:00Z",
      "risk_level": "HIGH",
      "risk_score": 3,
      "wind_mph": 42,
      "rain_inches_per_hour": 0.1,
      "snow_inches_per_hour": 0
    }
  ]
}
```

## Health Check

```http
GET /health
```

Used to determine whether the application process is running.

## Readiness Check

```http
GET /ready
```

Used to determine whether required dependencies are available.

Readiness checks may include:

- Database connectivity.
- Redis connectivity.
- Required configuration.
- External provider configuration.

## Validation Rules

The backend must validate:

- Origin and destination are not empty.
- Input strings have a maximum length.
- Departure time is a valid ISO 8601 timestamp.
- Load weight is finite and non-negative.
- Checkpoint interval is `10`, `25`, or `50`.
- External provider responses match the expected schema.

## OpenAPI Contract

The complete API contract is maintained in:

```text
packages/contracts/openapi.yaml
```

Changes to the API should update the OpenAPI document and generated frontend types.