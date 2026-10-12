# Route Planning

## Goal

Allow a truck driver to create a route plan using an origin, destination,
departure date/time, and load weight.

## User Inputs

- Origin
- Destination
- Departure date and time
- Load weight in pounds
- Checkpoint interval: 10, 25, or 50 miles

## Functional Requirements

- The application must validate all required fields.
- The backend must validate the request independently from the frontend.
- The application must geocode address endpoints and accept coordinates directly.
- The backend must request three route alternatives from the routing provider.
- Each route must include distance, duration, risk summary, and route geometry.
- The application must preserve timestamps in UTC internally.
- The application must return a deterministic route plan identifier.
- Equivalent repeated requests must return the stored plan (`200`) instead of recomputing.

## Request Schema

```json
{
  "origin": {"address": "Denver, CO"},
  "destination": {"latitude": 39.0997, "longitude": -94.5786},
  "departure_at": "2026-10-09T14:00:00Z",
  "load_weight_lb": 35000,
  "checkpoint_interval_miles": 25
}
```

Each endpoint accepts exactly one form: `{"address": string}` (non-blank,
at most 200 characters) or `{"latitude": number, "longitude": number}`
(finite WGS84). `departure_at` must carry a timezone and is normalized to
UTC. `checkpoint_interval_miles` is optional and defaults to `25`.

## Acceptance Criteria

- [x] Origin is required and cannot be blank.
- [x] Destination is required and cannot be blank.
- [x] Departure date/time must be a valid ISO 8601 timestamp.
- [x] Load weight must be finite and greater than or equal to zero.
- [x] Checkpoint interval must be `10`, `25`, or `50`.
- [x] The backend requests three route alternatives.
- [x] Invalid requests return a consistent `400` response.
- [x] Provider failures return a safe and documented error response.
- [x] Route responses are validated before being processed.
- [x] The feature is covered by unit and integration tests.