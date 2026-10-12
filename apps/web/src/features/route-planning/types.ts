/** Explicit TypeScript models for the TruckSafe route-plan API contract.
 *
 * Field names mirror the backend response shape (`build_response` in
 * `apps/api/route_plans/serializers.py`). Every field the backend may omit
 * is optional here; components must render safe fallbacks.
 */

/** Risk levels emitted by the backend, plus the frontend-only fallback. */
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'NO_TRAVEL';

export type CheckpointInterval = 10 | 25 | 50;

export const CHECKPOINT_INTERVALS: readonly CheckpointInterval[] = [10, 25, 50];

export interface EndpointInput {
  address: string;
}

export interface RoutePlanRequest {
  origin: EndpointInput;
  destination: EndpointInput;
  /** Explicit UTC ISO 8601 timestamp, e.g. `2026-10-12T14:00:00Z`. */
  departure_at: string;
  load_weight_lb: number;
  checkpoint_interval_miles: CheckpointInterval;
}

export interface CheckpointPayload {
  sequence: number;
  checkpoint_id: string;
  distance_miles: number;
  latitude: number;
  longitude: number;
  /** UTC ISO 8601 timestamp with `Z` suffix. */
  eta: string;
  weather_available: boolean;
  risk_level: RiskLevel | null;
  risk_score: number | null;
  risk_reasons: string[];
}

export type GeometryPayload = {
  type: 'LineString';
  coordinates: Array<[number, number]>;
};

export interface RoutePayload {
  id: string;
  distance_miles: number;
  duration_seconds: number;
  is_eligible: boolean;
  is_recommended: boolean;
  recommendation_rank: number;
  severe_miles: number;
  high_miles: number;
  no_travel_miles: number;
  average_risk_score: number;
  geometry: GeometryPayload | null;
  checkpoints: CheckpointPayload[];
}

export interface RecommendationReasonPayload {
  code: string;
  message: string;
  ranking_key: number[];
  criteria: string[];
}

export interface RoutePlanResponse {
  id: string;
  status: string;
  recommended_route_id: string | null;
  recommendation_reason: RecommendationReasonPayload | null;
  warnings: string[];
  routes: RoutePayload[];
}

/** Standard backend error envelope. */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}
