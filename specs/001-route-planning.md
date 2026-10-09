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
- The application must geocode the origin and destination.
- The application must request three route alternatives from the routing provider.
- Each route must include distance, duration, summary, and route geometry.
- The application must preserve timestamps in UTC internally.
- The application must return a deterministic route plan identifier.

## Request Schema

```json
{
  "origin": "Denver, CO",
  "destination": "Kansas City, MO",
  "departure_at": "2026-10-09T14:00:00Z",
  "load_weight_lb": 35000,
  "checkpoint_interval_miles": 25
}
```

## Acceptance Criteria

- [ ] Origin is required and cannot be blank.
- [ ] Destination is required and cannot be blank.
- [ ] Departure date/time must be a valid ISO 8601 timestamp.
- [ ] Load weight must be finite and greater than or equal to zero.
- [ ] Checkpoint interval must be `10`, `25`, or `50`.
- [ ] The backend requests three route alternatives.
- [ ] Invalid requests return a consistent `400` response.
- [ ] Provider failures return a safe and documented error response.
- [ ] Route responses are validated before being processed.
- [ ] The feature is covered by unit and integration tests.