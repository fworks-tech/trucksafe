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
- Color each route segment by its risk level, using the backend
  `risk_segments` intervals into the returned geometry.

## Risk Colors

| Risk | Segment color | Checkpoint color |
|---|---|---|
| Low | Green | Green |
| Moderate | Yellow | Yellow |
| High | Orange | Orange |
| Severe | Red | Red |
| No Travel | Dark red | Dark red |
| Unavailable | Gray | Gray |

Unavailable risk is gray and never rendered as Low.

## Segment Risk Rules

- Segment risk comes from the backend, never recomputed by the client.
- A segment is the geometry interval between consecutive checkpoints and
  carries the risk of the checkpoint at its end.
- The backend returns `risk_segments` with `start_index`/`end_index`
  into `geometry.coordinates`; the client slices those indices.
- Color is never the only signal: segments also vary in width and
  opacity, the legend spells out every color, and the route cards and
  checkpoint lists remain the accessible source of truth.
- Mismatched, gapped, or overlapping intervals disable segment coloring
  for that route only; the route falls back to route-level coloring.
- Unavailable segment risk renders gray and the route stays ineligible.
- No Travel segments render dark red and dashed, never as safe.
- Segment features are created once per response; selection changes
  filters only.

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

- [x] All available routes are visible.
- [x] The recommended route is visually distinct.
- [x] Checkpoints are displayed at the configured interval.
- [x] Checkpoint risk colors match the risk level.
- [x] Clicking a checkpoint shows its data.
- [x] Segment colors match the backend `risk_segments` risk levels.
- [x] Segment coloring degrades to route-level coloring for a route with
      mismatched intervals.
- [x] Unavailable segment risk renders gray, not Low.
- [x] Route summaries match the backend response.
- [x] The map remains usable while changing the selected route.
- [x] The main map interaction is covered by an end-to-end test.