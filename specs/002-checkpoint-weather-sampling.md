# Checkpoint and Weather Sampling

## Goal

Sample weather conditions along each route using the truck's estimated arrival
time at each checkpoint.

## Functional Requirements

- Checkpoints must be generated along the route geometry.
- The configured interval must be 10, 25, or 50 miles.
- Checkpoint distance must be measured along the route, not as a straight-line distance.
- The route destination must always be represented by a final checkpoint.
- Each checkpoint must contain coordinates and an estimated arrival time.
- Weather must be requested using the checkpoint coordinates and estimated arrival time.
- Weather data must include wind, rain, and snow values when provided by the provider.

## ETA Calculation

```text
checkpoint_eta =
departure_time +
(checkpoint_distance / route_distance) * route_duration
```

## Checkpoint Schema

```json
{
  "sequence": 1,
  "distance_miles": 25,
  "latitude": 39.7392,
  "longitude": -104.9903,
  "eta": "2026-10-09T15:20:00Z"
}
```

## Acceptance Criteria

- [ ] Checkpoints are ordered by distance.
- [ ] Checkpoint distances are non-negative.
- [ ] Checkpoint ETAs are non-decreasing.
- [ ] The final route destination is included.
- [ ] Weather requests use the checkpoint ETA.
- [ ] Weather values are normalized to the application's internal units.
- [ ] Malformed weather responses are rejected safely.
- [ ] Weather provider timeouts are handled without exposing internal errors.
- [ ] Checkpoint and ETA calculations have unit test coverage.