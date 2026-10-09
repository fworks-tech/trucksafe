# ADR-003: Route Recommendation Algorithm

## Status

Accepted

## Context

The assessment requires routes to be ranked according to weather risk and travel time.

## Decision

Rank routes using this priority order:

1. Fewest severe-weather miles.
2. Fewest high-risk miles.
3. Lowest average risk score.
4. Shortest travel time.

The ranking key is:

```python
(
    severe_miles,
    high_miles,
    average_risk_score,
    duration_seconds,
)
```

The route with the lexicographically smallest key is recommended.

## Route Metrics

For each route, calculate:

- `severe_miles`
- `high_miles`
- `average_risk_score`
- `duration_seconds`

Risk miles are assigned to route segments between consecutive checkpoints.

## Rationale

This algorithm directly represents the assessment requirements and is deterministic.

Severe weather is prioritized over high weather because it represents a greater operational risk. Travel time is considered only after weather risk has been compared.

## Consequences

The algorithm is simple to explain and test.

It does not attempt to calculate a generalized cost function or optimize arbitrary driver preferences. Such flexibility is outside the current scope.