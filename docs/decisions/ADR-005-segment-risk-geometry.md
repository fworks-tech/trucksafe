# ADR-005: Segment Risk via Enriched Geometry Index Intervals

## Status

Accepted

## Context

PR #12 ships the base route map: one colored line per route, plus
checkpoint markers carrying per-checkpoint risk. The next visualization
step (PR #13) colors portions of a route by risk.

The API already classifies risk per checkpoint and already attributes
risk miles to the segment between consecutive checkpoints
(`aggregate.py`). What it does not expose is which part of the *geometry*
each segment covers, so the frontend cannot color risk without
reimplementing the backend's distance interpolation — the exact
duplication the architecture forbids.

Three representations were considered:

- **Risk per geometry point.** Rejected: risk is per segment, not per
  point. N points imply N-1 segments, so a point-per-point mapping needs
  an off-by-one convention the client must guess at.
- **A GeoJSON FeatureCollection of segment geometries.** Rejected: it
  duplicates geometry (shared endpoints), doubles payload for long
  routes, and lets the segments drift out of sync with `geometry`.
- **Index intervals into the returned geometry.** Chosen.

## Decision

Expose segment risk as an optional `risk_segments` array on each route.

- A segment is the route portion between two consecutive checkpoints
  and inherits the risk of the checkpoint at its end — the same
  attribution the route-level summary already uses, so summary and map
  can never disagree.
- The backend returns an *enriched* `geometry`: the provider polyline
  plus interpolated vertices at checkpoint positions. Origin and
  destination stay first and last; enrichment is shape-preserving.
- Each segment entry carries `start_index`/`end_index` (inclusive) into
  that `geometry.coordinates`. The client slices those indices to get
  the sub-line to draw; no interpolation, no duplicated geometry.
- Unavailable weather yields `risk_level: null` / `risk_score: null`,
  matching the checkpoint rule that missing risk is never Low.
- Validation is all-or-nothing per route: one out-of-range, overlapping,
  or gapped interval omits the whole array for that route. A partially
  wrong risk picture is never shipped.
- The field is additive and optional. Clients that do not know it fall
  back to the existing route-level coloring, so responses stay backward
  compatible and no API version bump is needed.

Geometry enrichment lives in the framework-independent `routing`
package (`routing/segments.py`). It imports nothing from Django, DRF,
the database, or provider SDKs, and reuses the existing haversine and
interpolation helpers so there is exactly one distance model.

## Consequences

- The API response grows slightly: the geometry gains at most one vertex
  per checkpoint. No client-side interpolation is introduced.
- Route-level metrics, eligibility, and recommendation are unchanged;
  they still derive from the same checkpoint classifications.
- Mock providers need no change: enrichment is a pure function of the
  returned `RouteGeometry` points and the generated checkpoints.
- When real providers arrive they can return richer per-edge metadata;
  the contract still only asks for geometry plus a risk classification
  per checkpoint, so no provider types leak into the domain.
- A weather-grid endpoint (PR #14) can feed the same classification step
  without changing this contract.
