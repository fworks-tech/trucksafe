/** Geospatial normalization for route-plan map rendering.
 *
 * The backend returns route geometry as a GeoJSON LineString with
 * `[longitude, latitude]` coordinates in WGS84 (`build_response` in
 * `apps/api/route_plans/serializers.py`). Checkpoints instead carry separate
 * `latitude` / `longitude` fields. Nothing here trusts that shape: every
 * value is validated (finite numbers, WGS84 bounds, minimum point count)
 * before it may reach the map library. Invalid geometry is dropped and
 * reported as absent; the textual route comparison always remains.
 */

import { worstRiskLevel } from '../route-planning/risk';
import type {
  CheckpointPayload,
  RiskLevel,
  RiskSegmentPayload,
  RoutePayload,
  RoutePlanResponse,
} from '../route-planning/types';

/** One validated position as `[longitude, latitude]` (GeoJSON order). */
export type LngLat = [longitude: number, latitude: number];

export interface ValidRouteGeometry {
  coordinates: LngLat[];
}

export interface ValidCheckpointPoint {
  latitude: number;
  longitude: number;
}

export interface MapBounds {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidLongitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180;
}

function isValidLatitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90;
}

/** Validate one GeoJSON position (`[longitude, latitude]`, extras ignored). */
export function toLngLat(value: unknown): LngLat | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [longitude, latitude] = value;
  if (!isValidLongitude(longitude) || !isValidLatitude(latitude)) return null;
  return [longitude, latitude];
}

/** Normalize a route geometry payload into a renderable line, or null. */
export function normalizeRouteGeometry(geometry: unknown): ValidRouteGeometry | null {
  if (typeof geometry !== 'object' || geometry === null) return null;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== 'LineString') return null;
  if (!Array.isArray(candidate.coordinates)) return null;
  const coordinates: LngLat[] = [];
  for (const position of candidate.coordinates) {
    const point = toLngLat(position);
    if (point === null) return null;
    coordinates.push(point);
  }
  // A line needs at least two distinct-enough points; a single repeated
  // coordinate carries no direction and would mislead on the map.
  if (coordinates.length < 2) return null;
  return { coordinates };
}

/** Normalize one checkpoint into a mappable point, or null when invalid. */
export function normalizeCheckpointPoint(
  checkpoint: Pick<CheckpointPayload, 'latitude' | 'longitude'>,
): ValidCheckpointPoint | null {
  if (!isValidLatitude(checkpoint.latitude) || !isValidLongitude(checkpoint.longitude)) {
    return null;
  }
  return { latitude: checkpoint.latitude, longitude: checkpoint.longitude };
}

/** Bounding box for validated positions, or null when empty. */
export function boundsForPositions(positions: readonly LngLat[]): MapBounds | null {
  if (positions.length === 0) return null;
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;
  for (const [longitude, latitude] of positions) {
    if (longitude < minLongitude) minLongitude = longitude;
    if (latitude < minLatitude) minLatitude = latitude;
    if (longitude > maxLongitude) maxLongitude = longitude;
    if (latitude > maxLatitude) maxLatitude = latitude;
  }
  // A zero-area box (single repeated point) cannot be fitted; pad it so
  // the viewport still centers on something meaningful.
  if (minLongitude === maxLongitude) {
    minLongitude -= 0.05;
    maxLongitude += 0.05;
  }
  if (minLatitude === maxLatitude) {
    minLatitude -= 0.05;
    maxLatitude += 0.05;
  }
  return { minLongitude, minLatitude, maxLongitude, maxLatitude };
}

export type RouteVisualState =
  | 'recommended-selected'
  | 'recommended'
  | 'selected'
  | 'eligible'
  | 'ineligible'
  | 'no-travel'
  | 'no-geometry';

export interface VisualStateOptions {
  selectedRouteId: string | null;
  recommendedRouteId: string | null;
}

export interface MappableRoute extends Omit<RoutePayload, 'geometry'> {
  /** Geometry after `normalizeRouteGeometry`; null means list-only. */
  geometry: ValidRouteGeometry | null;
}

export interface MappableRouteLine {
  routeId: string;
  state: Exclude<RouteVisualState, 'no-geometry'>;
  coordinates: LngLat[];
}

export type CheckpointRole = 'origin' | 'via' | 'destination';

export interface MappableCheckpoint {
  checkpointId: string;
  routeId: string;
  longitude: number;
  latitude: number;
  risk: RiskLevel | null;
  weatherAvailable: boolean;
  sequence: number;
  role: CheckpointRole;
}

export interface MappableRouteSegment {
  startIndex: number;
  endIndex: number;
  risk: RiskLevel | null;
  coordinates: LngLat[];
}

export interface NormalizedPlanMap {
  lines: MappableRouteLine[];
  checkpoints: MappableCheckpoint[];
  /** Display state for every route, including geometry-less ones. */
  states: Record<string, RouteVisualState>;
  bounds: MapBounds | null;
  origin: LngLat | null;
  destination: LngLat | null;
  recommendedMidpoint: LngLat | null;
  /** Per-route risk segments keyed by route ID; absent when unavailable. */
  segments: Record<string, MappableRouteSegment[]>;
}

function checkpointRole(index: number, total: number): CheckpointRole {
  if (index === 0) return 'origin';
  if (index === total - 1) return 'destination';
  return 'via';
}

/** Normalize one response into map-ready data. Invalid geometry and
 * invalid checkpoint coordinates are omitted; the caller renders the
 * textual comparison and a degraded-state message for anything missing.
 */
export function normalizePlanMap(
  response: RoutePlanResponse,
  options: VisualStateOptions,
): NormalizedPlanMap {
  const lines: MappableRouteLine[] = [];
  const checkpoints: MappableCheckpoint[] = [];
  const states: Record<string, RouteVisualState> = {};
  const segments: Record<string, MappableRouteSegment[]> = {};
  const geometries = new Map<string, ValidRouteGeometry>();

  for (const route of response.routes) {
    const geometry = normalizeRouteGeometry(route.geometry);
    const mappable: MappableRoute = { ...route, geometry };
    const state = routeVisualState(mappable, options);
    states[route.id] = state;
    if (geometry !== null && state !== 'no-geometry') {
      geometries.set(route.id, geometry);
      lines.push({ routeId: route.id, state, coordinates: geometry.coordinates });
      const routeSegments = extractRiskSegments(
        route.risk_segments,
        geometry.coordinates,
      );
      if (routeSegments !== null) {
        segments[route.id] = routeSegments;
      }
    }
    route.checkpoints.forEach((checkpoint, index) => {
      const point = normalizeCheckpointPoint(checkpoint);
      if (point === null) return;
      checkpoints.push({
        checkpointId: checkpoint.checkpoint_id,
        routeId: route.id,
        longitude: point.longitude,
        latitude: point.latitude,
        risk: checkpoint.risk_level,
        weatherAvailable: checkpoint.weather_available,
        sequence: checkpoint.sequence,
        role: checkpointRole(index, route.checkpoints.length),
      });
    });
  }

  const bounds = boundsForPositions(lines.flatMap((line) => line.coordinates));

  // Endpoint markers follow the selected route's checkpoints (same
  // first-is-origin convention as the checkpoint list), falling back
  // to raw line endpoints when no checkpoint has valid coordinates.
  const anchorRouteId =
    (options.selectedRouteId !== null &&
    response.routes.some((route) => route.id === options.selectedRouteId)
      ? options.selectedRouteId
      : null) ??
    options.recommendedRouteId ??
    response.routes[0]?.id ??
    null;
  const anchorPoints = checkpoints.filter(
    (checkpoint) => checkpoint.routeId === anchorRouteId,
  );
  const anchorGeometry =
    anchorRouteId !== null ? geometries.get(anchorRouteId) : undefined;
  const fallbackCoordinates = lines[0]?.coordinates;
  const endpointCoordinates = anchorGeometry?.coordinates ?? fallbackCoordinates;
  const firstPoint: LngLat | null =
    anchorPoints.length > 0
      ? [anchorPoints[0]!.longitude, anchorPoints[0]!.latitude]
      : (endpointCoordinates?.[0] ?? null);
  const lastPoint: LngLat | null =
    anchorPoints.length > 0
      ? [
          anchorPoints[anchorPoints.length - 1]!.longitude,
          anchorPoints[anchorPoints.length - 1]!.latitude,
        ]
      : (endpointCoordinates?.[endpointCoordinates.length - 1] ?? null);

  const recommendedLine = lines.find(
    (line) => line.routeId === options.recommendedRouteId,
  );
  const recommendedMidpoint =
    recommendedLine !== undefined
      ? (recommendedLine.coordinates[
          Math.floor(recommendedLine.coordinates.length / 2)
        ] ?? null)
      : null;

  return {
    lines,
    checkpoints,
    states,
    bounds,
    origin: firstPoint,
    destination: lastPoint,
    recommendedMidpoint,
    segments,
  };
}

function extractRiskSegments(
  rawSegments: RiskSegmentPayload[] | undefined,
  geometryCoordinates: LngLat[],
): MappableRouteSegment[] | null {
  if (rawSegments === undefined || rawSegments.length === 0) return null;

  const result: MappableRouteSegment[] = [];
  let prevEnd = 0;

  for (const seg of rawSegments) {
    const startIndex = seg.start_index;
    const endIndex = seg.end_index;
    if (
      !Number.isInteger(startIndex) ||
      !Number.isInteger(endIndex) ||
      startIndex < 0 ||
      endIndex >= geometryCoordinates.length ||
      endIndex < startIndex ||
      startIndex !== prevEnd
    ) {
      return null;
    }
    prevEnd = endIndex;
    if (startIndex === endIndex) continue;
    result.push({
      startIndex,
      endIndex,
      risk: seg.risk_level,
      coordinates: geometryCoordinates.slice(startIndex, endIndex + 1),
    });
  }

  if (result.length === 0) return null;
  if (result[result.length - 1]!.endIndex !== geometryCoordinates.length - 1) return null;

  return result;
}

/** Map display state for one route. The backend stays authoritative:
 * recommendation and eligibility come from the response, never recomputed.
 * Callers pass routes with already-normalized geometry so an invalid
 * payload can never reach this mapping as renderable.
 */
export function routeVisualState(
  route: MappableRoute,
  options: VisualStateOptions,
): RouteVisualState {
  if (route.geometry === null) return 'no-geometry';
  const noTravel =
    route.no_travel_miles > 0 || worstRiskLevel(route.checkpoints) === 'NO_TRAVEL';
  if (noTravel) return 'no-travel';
  if (!route.is_eligible) return 'ineligible';
  const recommended =
    options.recommendedRouteId !== null &&
    route.id === options.recommendedRouteId &&
    route.is_recommended;
  const selected =
    options.selectedRouteId !== null && route.id === options.selectedRouteId;
  if (recommended && selected) return 'recommended-selected';
  if (recommended) return 'recommended';
  if (selected) return 'selected';
  return 'eligible';
}
