# Route Recommendation

## Goal

Recommend the safest route while considering severe weather, high-risk weather,
average risk, and travel time.

## Ranking Priority

Routes must be ranked using this order:

1. Fewest Severe miles
2. Fewest High miles
3. Lowest average risk
4. Shortest travel time

## Ranking Key

```text
(
  severe_miles,
  high_miles,
  average_risk_score,
  duration_seconds
)
```

The route with the smallest ranking key is recommended.

## Route Metrics

Each route must expose:

- Total distance
- Total duration
- Severe-weather miles
- High-risk miles
- Average risk score
- Recommendation rank
- Whether it is recommended

## Acceptance Criteria

- [ ] All returned route alternatives are displayed.
- [ ] Severe miles have priority over all other criteria.
- [ ] High-risk miles are compared after severe miles.
- [ ] Average risk is compared after severe and high-risk miles.
- [ ] Travel time is used as the final tie-breaker.
- [ ] Recommendation results are deterministic.
- [ ] The recommended route includes an explanation.
- [ ] Route ranking is covered by unit tests.