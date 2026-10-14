# Risk Model

## Purpose

The risk model classifies weather conditions at route checkpoints and applies truck load restrictions.

Risk is calculated independently for each checkpoint using:

- Wind speed.
- Rain intensity.
- Snow intensity.
- Truck load weight.

## Risk Severity

The internal severity order is:

```text
LOW < MODERATE < HIGH < SEVERE < NO_TRAVEL
```

When multiple conditions apply, the highest severity is selected.

## Wind Rules

| Range | Risk |
|---|---|
| `< 25 mph` | Low |
| `25 to <35 mph` | Moderate |
| `35 to <45 mph` | High |
| `45 to <55 mph` | Severe |
| `>= 55 mph` | No Travel |

## Rain Rules

| Range | Risk |
|---|---|
| `< 0.10 in/hr` | Low |
| `0.10 to <0.25 in/hr` | Moderate |
| `0.25 to <0.50 in/hr` | High |
| `0.50 to <=1.00 in/hr` | Severe |
| `> 1.00 in/hr` | No Travel |

## Snow Rules

| Range | Risk |
|---|---|
| `< 0.5 in/hr` | Low |
| `0.5 to <1.0 in/hr` | Moderate |
| `1.0 to <2.0 in/hr` | High |
| `2.0 to <=3.0 in/hr` | Severe |
| `> 3.0 in/hr` | No Travel |

## Load Rules

The following rules can increase risk:

- Wind speed of `>= 55 mph` results in `No Travel` for every load.
- Wind speed from `45` to `<55 mph` and load weight greater than `30,000 lb` results in `No Travel`.
- Wind speed from `35` to `<45 mph` and load weight greater than `40,000 lb` results in `Severe`.

Load rules must never reduce a risk classification.

## Boundary Convention

The implementation uses lower-inclusive and upper-exclusive intervals unless explicitly stated otherwise.

Examples:

```text
25 mph wind       -> Moderate
35 mph wind       -> High
45 mph wind       -> Severe
55 mph wind       -> No Travel

0.10 in/hr rain   -> Moderate
0.25 in/hr rain   -> High
0.50 in/hr rain   -> Severe
1.00 in/hr rain   -> Severe
above 1.00        -> No Travel
```

## Risk Reasons

Each risk result should include one or more reasons.

Example:

```json
{
  "risk_level": "NO_TRAVEL",
  "risk_score": 5,
  "risk_reasons": [
    "wind >= 55 mph",
    "rain 1.1 in/h"
  ]
}
```

## Risk Scores

The default numeric scores are:

| Risk | Score |
|---|---:|
| Low | 1 |
| Moderate | 2 |
| High | 3 |
| Severe | 4 |
| No Travel | 5 |

The score is used to calculate average route risk.

## Route-Level Metrics

For every route, calculate:

- Severe miles.
- High miles.
- Average risk score.
- Total travel time.

Risk miles are calculated along route segments between consecutive checkpoints.

## Segment Risk

A segment is the portion of a route between two consecutive
checkpoints, and it carries the risk of the checkpoint at its end. The
classification is never recomputed per segment: it is the same
`calculate_risk` result sampled at the defining checkpoint, so the map
can never disagree with the route cards.

To let clients color segments without redoing interpolation, the API
returns `risk_segments` alongside an enriched `geometry`:

- The geometry gains vertices at checkpoint positions (origin and
  destination always remain the first and last coordinate).
- Each segment entry names an interval of `geometry.coordinates` with
  `start_index`/`end_index`, inclusive, in origin to destination order.
- Slicing `coordinates` between those indices yields exactly the
  sub-line to draw for that risk level.
- Unavailable weather leaves `risk_level` and `risk_score` as `null` in
  both segment and checkpoint form; missing risk is never Low.
- Validation is all-or-nothing per route. A single out-of-range,
  overlapping, or gapped interval omits every segment for that route so
  a partially wrong picture is never shown. Route-level metrics,
  eligibility, and recommendation are unaffected: they still come from
  the same checkpoint classifications.

Because segment risk is derived from the same classification as the
route-level summary, the route cards remain the authoritative fallback
whenever `risk_segments` is absent.

## Testing Requirements

The risk engine must test:

- Every threshold.
- Values immediately below and above every threshold.
- Zero values.
- Load rule boundaries.
- Multiple simultaneous weather risks.
- Precedence of `No Travel`.
- Deterministic risk reasons.