/** Deterministic test fixtures shaped like the real API responses.
 *
 * Payloads mirror `build_response` in
 * `apps/api/route_plans/serializers.py`. Small by design: three routes with
 * three checkpoints each, instead of the 39-checkpoint production shape.
 */

import type {
  CheckpointPayload,
  RecommendationReasonPayload,
  RiskLevel,
  RiskSegmentPayload,
  RoutePayload,
  RoutePlanResponse,
} from './types';

let checkpointSequence = 0;

function nextCheckpointId(): string {
  checkpointSequence += 1;
  return `cp-test-${checkpointSequence}`;
}

export interface CheckpointOverrides {
  weatherAvailable?: boolean;
  riskLevel?: RiskLevel | null;
  riskScore?: number | null;
  riskReasons?: string[];
  eta?: string;
  distanceMiles?: number;
}

export function makeCheckpoint(overrides: CheckpointOverrides = {}): CheckpointPayload {
  const {
    weatherAvailable = true,
    riskLevel = 'LOW',
    riskScore = 1,
    riskReasons = [],
    eta = '2026-10-12T14:00:00Z',
    distanceMiles = 0,
  } = overrides;
  return {
    sequence: 1,
    checkpoint_id: nextCheckpointId(),
    distance_miles: distanceMiles,
    latitude: 41.88,
    longitude: -87.63,
    eta,
    weather_available: weatherAvailable,
    risk_level: riskLevel,
    risk_score: riskScore,
    risk_reasons: riskReasons,
  };
}

export interface RouteOverrides {
  eligible?: boolean;
  recommended?: boolean;
  rank?: number;
  severeMiles?: number;
  highMiles?: number;
  noTravelMiles?: number;
  averageRiskScore?: number;
  checkpoints?: CheckpointPayload[];
  geometryNull?: boolean;
  riskSegments?: RiskSegmentPayload[];
}

/** Segments matching the default three-checkpoint, two-point geometry. */
export function makeRiskSegments(): RiskSegmentPayload[] {
  return [
    {
      start_index: 0,
      end_index: 1,
      risk_level: 'MODERATE',
      risk_score: 2,
      risk_reasons: [],
    },
    {
      start_index: 1,
      end_index: 2,
      risk_level: 'LOW',
      risk_score: 1,
      risk_reasons: [],
    },
  ];
}

export function makeRoute(id: string, overrides: RouteOverrides = {}): RoutePayload {
  const {
    eligible = true,
    recommended = false,
    rank = 1,
    severeMiles = 0,
    highMiles = 0,
    noTravelMiles = 0,
    averageRiskScore = 1,
    geometryNull = false,
    riskSegments,
  } = overrides;
  const checkpoints = overrides.checkpoints ?? [
    makeCheckpoint({ distanceMiles: 0 }),
    makeCheckpoint({ distanceMiles: 25, riskLevel: 'MODERATE', riskScore: 2 }),
    makeCheckpoint({ distanceMiles: 50 }),
  ];
  return {
    id,
    distance_miles: 50,
    duration_seconds: 3600,
    is_eligible: eligible,
    is_recommended: recommended,
    recommendation_rank: rank,
    severe_miles: severeMiles,
    high_miles: highMiles,
    no_travel_miles: noTravelMiles,
    average_risk_score: averageRiskScore,
    geometry: geometryNull
      ? null
      : {
          type: 'LineString',
          coordinates: [
            [-87.63, 41.88],
            [-87.3, 41.4],
            [-87.0, 41.0],
          ],
        },
    checkpoints,
    risk_segments: riskSegments ?? (geometryNull ? undefined : makeRiskSegments()),
  };
}

const DEFAULT_REASON: RecommendationReasonPayload = {
  code: 'LOWEST_RISK_RANKING',
  message: 'Selected using the deterministic route ranking criteria.',
  ranking_key: [0, 0, 1, 3600],
  criteria: ['severe_miles', 'high_miles', 'average_risk_score', 'duration_seconds'],
};

export interface PlanOverrides {
  routes?: RoutePayload[];
  recommendedRouteId?: string | null;
  reason?: RecommendationReasonPayload | null;
  warnings?: string[];
  planId?: string;
}

/** Successful plan: exactly three routes, first one recommended. */
export function makeRoutePlan(overrides: PlanOverrides = {}): RoutePlanResponse {
  const routes = overrides.routes ?? [
    makeRoute('route-1', { recommended: true, rank: 1 }),
    makeRoute('route-2', { rank: 2, highMiles: 5, averageRiskScore: 2 }),
    makeRoute('route-3', { rank: 3, severeMiles: 2, averageRiskScore: 3 }),
  ];
  return {
    id: overrides.planId ?? 'plan-test-001',
    status: 'completed',
    recommended_route_id:
      overrides.recommendedRouteId === undefined
        ? 'route-1'
        : overrides.recommendedRouteId,
    recommendation_reason:
      overrides.reason === undefined ? DEFAULT_REASON : overrides.reason,
    warnings: overrides.warnings ?? [],
    routes,
  };
}

/** Every route ineligible: no recommendation, backend warning preserved. */
export function makeAllIneligiblePlan(): RoutePlanResponse {
  return makeRoutePlan({
    routes: [
      makeRoute('route-1', { eligible: false, rank: 1, noTravelMiles: 4 }),
      makeRoute('route-2', { eligible: false, rank: 2, noTravelMiles: 6 }),
      makeRoute('route-3', { eligible: false, rank: 3, noTravelMiles: 9 }),
    ],
    recommendedRouteId: null,
    reason: null,
    warnings: ['no eligible route available; no recommendation made'],
  });
}

/** Optional provider data missing: nulls and unavailable weather. */
export function makeMinimalPlan(): RoutePlanResponse {
  const checkpoints = [
    makeCheckpoint({
      weatherAvailable: false,
      riskLevel: null,
      riskScore: null,
      distanceMiles: 0,
    }),
    makeCheckpoint({
      weatherAvailable: false,
      riskLevel: null,
      riskScore: null,
      distanceMiles: 25,
    }),
  ];
  return makeRoutePlan({
    routes: [
      makeRoute('route-1', { recommended: true, checkpoints, geometryNull: true }),
    ],
    warnings: ['weather unavailable for 2 checkpoints'],
  });
}
