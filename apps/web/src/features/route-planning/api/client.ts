/** Typed client for `POST /api/v1/route-plans`.
 *
 * - Sends JSON with `Content-Type: application/json`.
 * - Always sends a valid `X-Request-ID` (propagates a supplied one, else
 *   generates a fresh id per request).
 * - Validates successful payloads with Zod: unknown fields are stripped,
 *   missing or mistyped required fields reject with a `malformed` error,
 *   while nested provider data degrades to safe fallbacks (missing weather
 *   -> unavailable, missing risk -> `null`, missing geometry -> `null`).
 * - Never retries; never logs payloads.
 */

import { z } from 'zod';

import type {
  ApiErrorEnvelope,
  CheckpointPayload,
  GeometryPayload,
  RecommendationReasonPayload,
  RiskLevel,
  RoutePayload,
  RoutePlanRequest,
  RoutePlanResponse,
  WeatherGridResponse,
} from '../types';
import { categoryForStatus, RoutePlanApiError } from './errors';
import { isValidRequestId, resolveRequestId } from './requestId';

const riskLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL']);

const checkpointSchema = z.object({
  sequence: z.number(),
  checkpoint_id: z.string(),
  distance_miles: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  eta: z.string(),
  weather_available: z.boolean().catch(false),
  risk_level: riskLevelSchema.nullable().catch(null),
  risk_score: z.number().nullable().catch(null),
  risk_reasons: z.array(z.string()).catch([]),
});

const geometrySchema = z
  .object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  })
  .nullable()
  .catch(null);

const riskSegmentSchema = z.object({
  start_index: z.number().int().min(0),
  end_index: z.number().int().min(0),
  risk_level: riskLevelSchema.nullable().catch(null),
  risk_score: z.number().min(1).max(5).nullable().catch(null),
  risk_reasons: z.array(z.string()).catch([]),
});

const routeSchema = z.object({
  id: z.string(),
  distance_miles: z.number(),
  duration_seconds: z.number(),
  is_eligible: z.boolean(),
  is_recommended: z.boolean(),
  recommendation_rank: z.number(),
  severe_miles: z.number(),
  high_miles: z.number(),
  no_travel_miles: z.number(),
  average_risk_score: z.number(),
  geometry: geometrySchema,
  checkpoints: z.array(checkpointSchema),
  risk_segments: z.array(riskSegmentSchema).catch([]),
});

const recommendationReasonSchema = z.object({
  code: z.string(),
  message: z.string(),
  ranking_key: z.array(z.number()),
  criteria: z.array(z.string()),
});

const responseSchema = z.object({
  id: z.string(),
  status: z.string(),
  routing_provider: z.string().catch('unknown'),
  mock_mode: z.boolean().catch(false),
  recommended_route_id: z.string().nullable(),
  recommendation_reason: recommendationReasonSchema.nullable(),
  warnings: z.array(z.string()).catch([]),
  routes: z.array(routeSchema),
});

const weatherSchema = z
  .object({
    wind_mph: z.number(),
    rain_inches_per_hour: z.number(),
    snow_inches_per_hour: z.number(),
  })
  .nullable()
  .catch(null);

const weatherGridCellSchema = z.object({
  cell_id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  valid_at: z.string(),
  risk_level: riskLevelSchema.nullable().catch(null),
  risk_score: z.number().nullable().catch(null),
  risk_reasons: z.array(z.string()).catch([]),
  weather: weatherSchema,
});

const weatherGridResponseSchema = z.object({
  route_id: z.string(),
  route_plan_id: z.string(),
  forecast_start: z.string(),
  forecast_end: z.string(),
  cells: z.array(weatherGridCellSchema),
});

const envelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string(),
  }),
});

export interface CreateRoutePlanOptions {
  signal?: AbortSignal;
  /** Propagated when valid, otherwise a fresh id is generated. */
  requestId?: string;
}

export interface CreateRoutePlanResult {
  data: RoutePlanResponse;
  requestId: string;
}

export interface FetchWeatherGridOptions {
  signal?: AbortSignal;
  /** Propagated when valid, otherwise a fresh id is generated. */
  requestId?: string;
}

export interface FetchWeatherGridResult {
  data: WeatherGridResponse;
  requestId: string;
}

function apiBaseUrl(): string {
  const raw = import.meta.env['VITE_API_BASE_URL'];
  const base = typeof raw === 'string' && raw.length > 0 ? raw : '/api/v1';
  return base.replace(/\/+$/, '');
}

/** Read a response body as JSON, returning `null` for empty/invalid bodies. */
async function readJsonBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (text.trim().length === 0) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toTypedResponse(parsed: z.infer<typeof responseSchema>): RoutePlanResponse {
  const routes: RoutePayload[] = parsed.routes.map((route) => ({
    ...route,
    geometry: route.geometry as GeometryPayload | null,
    checkpoints: route.checkpoints.map((checkpoint): CheckpointPayload => ({
      ...checkpoint,
      risk_level: checkpoint.risk_level as RiskLevel | null,
    })),
  }));
  return {
    ...parsed,
    recommendation_reason:
      parsed.recommendation_reason as RecommendationReasonPayload | null,
    routes,
  };
}

function toTypedWeatherGridResponse(
  parsed: z.infer<typeof weatherGridResponseSchema>,
): WeatherGridResponse {
  return {
    ...parsed,
    cells: parsed.cells.map((cell) => ({
      ...cell,
      risk_level: cell.risk_level as RiskLevel | null,
      weather: cell.weather,
    })),
  };
}

/**
 * Create a route plan. Resolves with the parsed payload and the effective
 * request id; rejects with `RoutePlanApiError` on any failure.
 */
export async function createRoutePlan(
  request: RoutePlanRequest,
  options: CreateRoutePlanOptions = {},
): Promise<CreateRoutePlanResult> {
  const sentRequestId = resolveRequestId(options.requestId);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/route-plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': sentRequestId,
      },
      body: JSON.stringify(request),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RoutePlanApiError({
        category: 'aborted',
        status: null,
        requestId: sentRequestId,
        backendCode: null,
        backendMessage: null,
      });
    }
    throw new RoutePlanApiError({
      category: 'network',
      status: null,
      requestId: sentRequestId,
      backendCode: null,
      backendMessage: null,
    });
  }

  const echoed = response.headers.get('X-Request-ID');
  const requestId = isValidRequestId(echoed) ? echoed : sentRequestId;
  const body = await readJsonBody(response);

  if (!response.ok) {
    const envelope = envelopeSchema.safeParse(body);
    const parsed: ApiErrorEnvelope['error'] | null = envelope.success
      ? envelope.data.error
      : null;
    throw new RoutePlanApiError({
      category: categoryForStatus(response.status),
      status: response.status,
      requestId: parsed?.request_id ?? requestId,
      backendCode: parsed?.code ?? null,
      backendMessage: parsed?.message ?? null,
    });
  }

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new RoutePlanApiError({
      category: 'malformed',
      status: response.status,
      requestId,
      backendCode: null,
      backendMessage: null,
    });
  }
  return { data: toTypedResponse(parsed.data), requestId };
}

/**
 * Fetch the weather grid for a route plan at a specific forecast offset.
 * Resolves with the parsed payload and the effective request id;
 * rejects with `RoutePlanApiError` on any failure.
 */
export async function fetchWeatherGrid(
  routePlanId: string,
  offsetHours: number,
  options: FetchWeatherGridOptions = {},
): Promise<FetchWeatherGridResult> {
  if (!Number.isInteger(offsetHours) || offsetHours < 0 || offsetHours > 48) {
    throw new RoutePlanApiError({
      category: 'malformed',
      status: 400,
      requestId: resolveRequestId(options.requestId),
      backendCode: 'INVALID_REQUEST',
      backendMessage: 'offsetHours must be an integer in 0..48',
    });
  }

  const sentRequestId = resolveRequestId(options.requestId);
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/route-plans/${encodeURIComponent(routePlanId)}/weather-grid?offset_hours=${offsetHours}`,
      {
        method: 'GET',
        headers: {
          'X-Request-ID': sentRequestId,
        },
        signal: options.signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RoutePlanApiError({
        category: 'aborted',
        status: null,
        requestId: sentRequestId,
        backendCode: null,
        backendMessage: null,
      });
    }
    throw new RoutePlanApiError({
      category: 'network',
      status: null,
      requestId: sentRequestId,
      backendCode: null,
      backendMessage: null,
    });
  }

  const echoed = response.headers.get('X-Request-ID');
  const requestId = isValidRequestId(echoed) ? echoed : sentRequestId;
  const body = await readJsonBody(response);

  if (!response.ok) {
    const envelope = envelopeSchema.safeParse(body);
    const parsed: ApiErrorEnvelope['error'] | null = envelope.success
      ? envelope.data.error
      : null;
    throw new RoutePlanApiError({
      category: categoryForStatus(response.status),
      status: response.status,
      requestId: parsed?.request_id ?? requestId,
      backendCode: parsed?.code ?? null,
      backendMessage: parsed?.message ?? null,
    });
  }

  const parsed = weatherGridResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new RoutePlanApiError({
      category: 'malformed',
      status: response.status,
      requestId,
      backendCode: null,
      backendMessage: null,
    });
  }
  return { data: toTypedWeatherGridResponse(parsed.data), requestId };
}
