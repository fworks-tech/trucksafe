/** MSW handlers modeling the backend contract for tests.
 *
 * Success handlers return fixture payloads; failure handlers return the
 * standard error envelope with the request id echoed back, exactly like
 * `RequestIdMiddleware` + `error_response` do in production.
 */

import { delay, http, HttpResponse, type HttpHandler } from 'msw';

import {
  makeAllIneligiblePlan,
  makeMinimalPlan,
  makeRoute,
  makeRoutePlan,
} from '../fixtures';

export type Scenario =
  | 'success'
  | 'allIneligible'
  | 'minimal'
  | 'badRequest'
  | 'unroutable'
  | 'provider'
  | 'unavailable'
  | 'malformed'
  | 'networkError'
  | 'empty'
  | 'badSegments'
  | 'noSegments';

export interface CapturedRequest {
  headers: Record<string, string>;
  body: unknown;
}

const ENVELOPES: Record<string, { status: number; code: string; message: string }> = {
  badRequest: {
    status: 400,
    code: 'INVALID_REQUEST',
    message: 'origin: Endpoint address must not be blank.',
  },
  unroutable: {
    status: 422,
    code: 'UNROUTABLE',
    message: 'mock provider cannot route zero distance',
  },
  provider: {
    status: 502,
    code: 'PROVIDER_UNAVAILABLE',
    message: 'route provider failed',
  },
  unavailable: {
    status: 503,
    code: 'PROVIDER_UNAVAILABLE',
    message: 'weather provider temporarily unavailable',
  },
};

const API_PATH = '*/api/v1/route-plans';

/** Build a POST handler for one scenario, optionally capturing the request. */
export function routePlansHandler(
  scenario: Scenario,
  captured?: CapturedRequest,
  delayMs = 0,
): HttpHandler {
  return http.post(API_PATH, async ({ request }) => {
    if (delayMs > 0) await delay(delayMs);
    if (captured !== undefined) {
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      captured.headers = headers;
      try {
        captured.body = await request.json();
      } catch {
        captured.body = null;
      }
    }
    const incomingId = request.headers.get('x-request-id') ?? 'test-request-id';

    switch (scenario) {
      case 'success':
        return HttpResponse.json(makeRoutePlan(), {
          status: 201,
          headers: { 'X-Request-ID': incomingId },
        });
      case 'allIneligible':
        return HttpResponse.json(makeAllIneligiblePlan(), {
          status: 201,
          headers: { 'X-Request-ID': incomingId },
        });
      case 'minimal':
        return HttpResponse.json(makeMinimalPlan(), {
          status: 201,
          headers: { 'X-Request-ID': incomingId },
        });
      case 'malformed':
        return HttpResponse.json(
          { routes: 'not-an-array' },
          { status: 201, headers: { 'X-Request-ID': incomingId } },
        );
      case 'badSegments':
        return HttpResponse.json(
          makeRoutePlan({
            routes: [
              {
                ...makeRoute('route-1', { recommended: true }),
                risk_segments: [
                  {
                    start_index: 0,
                    end_index: 99,
                    risk_level: 'LOW',
                    risk_score: 99,
                    risk_reasons: [],
                  },
                ],
              },
              makeRoute('route-2'),
              makeRoute('route-3'),
            ],
          }),
          { status: 201, headers: { 'X-Request-ID': incomingId } },
        );
      case 'noSegments':
        return HttpResponse.json(
          makeRoutePlan({
            routes: [
              {
                ...makeRoute('route-1', { recommended: true }),
                risk_segments: undefined,
              },
              { ...makeRoute('route-2'), risk_segments: undefined },
              { ...makeRoute('route-3'), risk_segments: undefined },
            ],
          }),
          { status: 201, headers: { 'X-Request-ID': incomingId } },
        );
      case 'empty':
        return HttpResponse.json(
          {
            id: 'plan-empty',
            status: 'completed',
            recommended_route_id: null,
            recommendation_reason: null,
            warnings: [],
            routes: [],
          },
          { status: 201, headers: { 'X-Request-ID': incomingId } },
        );
      case 'networkError':
        return HttpResponse.error();
      default: {
        const envelope = ENVELOPES[scenario];
        if (envelope === undefined) throw new Error(`Unknown scenario: ${scenario}`);
        return HttpResponse.json(
          {
            error: {
              code: envelope.code,
              message: envelope.message,
              request_id: incomingId,
            },
          },
          { status: envelope.status, headers: { 'X-Request-ID': incomingId } },
        );
      }
    }
  });
}
