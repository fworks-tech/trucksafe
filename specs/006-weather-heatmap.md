# Weather Heatmap

## Goal

Display forecasted weather risk along the trip corridor using a forecast slider
from 0 to 48 hours.

## Functional Requirements

- The slider must support values from 0 through 48 hours.
- The selected hour must be clearly displayed.
- Heatmap points must contain coordinates and risk information.
- Heatmap colors must correspond to risk levels.
- Changing the slider must update the forecast visualization.
- Weather grid responses should be cached by route plan and forecast offset.
- The UI must display a legend.

## Heatmap Data

```json
{
  "latitude": 39.7392,
  "longitude": -104.9903,
  "valid_at": "2026-10-10T02:00:00Z",
  "risk_level": "HIGH",
  "risk_score": 3
}
```

## Acceptance Criteria

- [x] Slider values range from `0` to `48`.
- [x] The selected forecast offset is visible to the user.
- [x] Heatmap colors match the documented legend.
- [x] Moving the slider updates the map data.
- [x] Repeated requests for the same offset use cached data when available.
- [x] The map is not recreated when only the forecast offset changes.
- [x] Weather provider errors result in a clear UI state.
- [x] The heatmap interaction is covered by an end-to-end test
