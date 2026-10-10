# Weather Risk Classification

## Goal

Classify checkpoint-level weather risk using wind, rain, snow, and load weight.

## Risk Priority

```text
Low < Moderate < High < Severe < No Travel
```

When multiple conditions apply, the highest severity must be selected.

## Wind Rules

| Range | Risk |
|---|---|
| `< 25 mph` | Low |
| `25–34 mph` | Moderate |
| `35–44 mph` | High |
| `45–54 mph` | Severe |
| `>= 55 mph` | No Travel |

## Rain Rules

| Range | Risk |
|---|---|
| `< 0.10 in/hr` | Low |
| `0.10–0.25 in/hr` | Moderate |
| `0.25–0.50 in/hr` | High |
| `0.50–1.00 in/hr` | Severe |
| `> 1.00 in/hr` | No Travel |

## Snow Rules

| Range | Risk |
|---|---|
| `< 0.5 in/hr` | Low |
| `0.5–1.0 in/hr` | Moderate |
| `1.0–2.0 in/hr` | High |
| `2.0–3.0 in/hr` | Severe |
| `> 3.0 in/hr` | No Travel |

## Load Rules

- Wind `>= 55 mph` results in `No Travel` for any load.
- Wind from `45` to `54 mph` and load greater than `30,000 lb` results in `No Travel`.
- Wind from `35` to `44 mph` and load greater than `40,000 lb` results in `Severe`.

Load rules may increase the risk level but must never reduce it.

## Risk Result

```json
{
  "risk_level": "SEVERE",
  "risk_score": 4,
  "risk_reasons": [
    "wind 45-54 mph with load > 30,000 lb"
  ]
}
```

Reasons come from two sources:

- A weather condition name (`wind`, `rain`, or `snow`) for every condition tied at the highest weather severity.
- A load rule phrase when a load rule applies.

## Acceptance Criteria

- [x] Every threshold is covered by tests.
- [x] Values immediately below, at, and above thresholds are tested.
- [x] The highest weather severity is selected.
- [x] Load rules are applied correctly.
- [x] Risk never decreases when load weight increases.
- [x] Risk never decreases when wind speed increases.
- [x] Every result contains a risk level and at least one reason.
- [x] Negative weather values are rejected.
- [x] The risk engine does not depend on HTTP, Django, or a database.