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

The route with the smallest ranking key is recommended. Eligible routes
always rank before ineligible ones, regardless of key; no route is
recommended when every route is ineligible.

## Recommendation Explanation

The recommended route must include a deterministic, machine-readable
explanation:

```json
{
  "recommended_route_id": "route-1",
  "recommendation_reason": {
    "code": "LOWEST_RISK_RANKING",
    "message": "Selected using the deterministic route ranking criteria.",
    "ranking_key": [0.0, 10.0, 1.8, 7200.0],
    "criteria": ["severe_miles", "high_miles", "average_risk_score", "duration_seconds"]
  }
}
```

`ranking_key` is the exact ranking tuple of the selected route.
When no route is eligible, `recommended_route_id` and
`recommendation_reason` are both `null` and warnings explain why.

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

- [x] All returned route alternatives are displayed.
- [x] Severe miles have priority over all other criteria.
- [x] High-risk miles are compared after severe miles.
- [x] Average risk is compared after severe and high-risk miles.
- [x] Travel time is used as the final tie-breaker.
- [x] Recommendation results are deterministic.
- [x] The recommended route includes an explanation.
- [x] Route ranking is covered by unit tests.