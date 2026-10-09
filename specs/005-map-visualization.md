# Map Visualization

## Goal

Display route alternatives, checkpoints, risk levels, ETAs, and route summaries
on an interactive map.

## Functional Requirements

- Display the origin marker.
- Display the destination marker.
- Display all returned route alternatives.
- Highlight the recommended route.
- Display checkpoints along each route.
- Use risk-specific colors for checkpoints.
- Show checkpoint details in a popup or accessible panel.
- Display route summaries outside or beside the map.

## Risk Colors

| Risk | Color |
|---|---|
| Low | Green |
| Moderate | Yellow |
| High | Orange |
| Severe | Red |
| No Travel | Dark red |

## Checkpoint Details

A checkpoint display must include:

- Distance from origin
- Estimated arrival time
- Risk level
- Risk reasons
- Wind
- Rain
- Snow

## Performance Requirements

- Route geometry must use map layers where possible.
- The map instance must not be recreated on every state update.
- Route selection must update only the necessary layers.
- Checkpoint rendering must remain responsive for long routes.
- The application must show loading and error states.

## Acceptance Criteria

- [ ] All available routes are visible.
- [ ] The recommended route is visually distinct.
- [ ] Checkpoints are displayed at the configured interval.
- [ ] Checkpoint risk colors match the risk level.
- [ ] Clicking a checkpoint shows its data.
- [ ] Route summaries match the backend response.
- [ ] The map remains usable while changing the selected route.
- [ ] The main map interaction is covered by an end-to-end test.