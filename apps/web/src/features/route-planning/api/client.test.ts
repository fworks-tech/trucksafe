import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { RoutePlanRequest } from '../types';
import { createRoutePlan } from './client';
import { RoutePlanApiError } from './errors';
import { routePlansHandler, type CapturedRequest, type Scenario } from './handlers';

const REQUEST: RoutePlanRequest = {
  origin: { address: 'Chicago, IL' },
  destination: { address: 'Dallas, TX' },
  departure_at: '2026-10-12T14:00:00Z',
  load_weight_lb: 20000,
  checkpoint_interval_miles: 25,
};

const server = setupServer();
let scenario: Scenario = 'success';
let captured: CapturedRequest = { headers: {}, body: null };

beforeAll(() => {
  server.use(routePlansHandler('success'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setScenario(next: Scenario): void {
  scenario = next;
  captured = { headers: {}, body: null };
  server.resetHandlers();
  server.use(routePlansHandler(scenario, captured));
}

async function createFails(scenarioName: Scenario): Promise<RoutePlanApiError> {
  setScenario(scenarioName);
  try {
    await createRoutePlan(REQUEST);
  } catch (error) {
    expect(error).toBeInstanceOf(RoutePlanApiError);
    return error as RoutePlanApiError;
  }
  throw new Error(`Scenario ${scenarioName} unexpectedly succeeded.`);
}

describe('createRoutePlan', () => {
  it('posts JSON to the route-plans endpoint with request id and body', async () => {
    setScenario('success');
    const { data, requestId } = await createRoutePlan(REQUEST, {
      requestId: 'client-id-1',
    });
    expect(data.routes).toHaveLength(3);
    expect(data.recommended_route_id).toBe('route-1');
    expect(requestId).toBe('client-id-1');
    expect(captured.headers['content-type']).toContain('application/json');
    expect(captured.headers['x-request-id']).toBe('client-id-1');
    expect(captured.body).toMatchObject({
      origin: { address: 'Chicago, IL' },
      departure_at: '2026-10-12T14:00:00Z',
      load_weight_lb: 20000,
      checkpoint_interval_miles: 25,
    });
  });

  it('generates a valid request id when none is supplied', async () => {
    setScenario('success');
    const { requestId } = await createRoutePlan(REQUEST);
    expect(requestId).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(captured.headers['x-request-id']).toBe(requestId);
  });

  it('maps 400 to a safe validation error with the envelope request id', async () => {
    const error = await createFails('badRequest');
    expect(error.category).toBe('validation');
    expect(error.status).toBe(400);
    expect(error.message).toBe('Please review the route plan details.');
    expect(error.backendCode).toBe('INVALID_REQUEST');
    expect(error.requestId).not.toBeNull();
  });

  it('maps 422 to a domain validation error', async () => {
    const error = await createFails('unroutable');
    expect(error.category).toBe('domain');
    expect(error.message).toBe('The submitted values are not valid for route planning.');
  });

  it('maps 502 to a provider error', async () => {
    const error = await createFails('provider');
    expect(error.category).toBe('provider');
    expect(error.message).toBe(
      'A route or weather provider failed while creating this plan.',
    );
  });

  it('maps 503 to a temporary-unavailable error', async () => {
    const error = await createFails('unavailable');
    expect(error.category).toBe('unavailable');
    expect(error.message).toBe(
      'The route planning service is temporarily unavailable. Please try again.',
    );
  });

  it('maps malformed success payloads to a generic error', async () => {
    const error = await createFails('malformed');
    expect(error.category).toBe('malformed');
    expect(error.message).toBe('We could not create the route plan. Please try again.');
  });

  it('maps network failures without leaking internals', async () => {
    const error = await createFails('networkError');
    expect(error.category).toBe('network');
    expect(error.message).toBe(
      'We could not reach the route planning service. Check your connection and try again.',
    );
    expect(error.status).toBeNull();
  });

  it('maps aborted requests to the aborted category', async () => {
    setScenario('success');
    const controller = new AbortController();
    controller.abort();
    try {
      await createRoutePlan(REQUEST, { signal: controller.signal });
    } catch (error) {
      expect(error).toBeInstanceOf(RoutePlanApiError);
      expect((error as RoutePlanApiError).category).toBe('aborted');
      return;
    }
    throw new Error('Aborted request unexpectedly succeeded.');
  });

  it('degrades nested provider data to safe fallbacks instead of failing', async () => {
    setScenario('minimal');
    const { data } = await createRoutePlan(REQUEST);
    const checkpoint = data.routes[0]?.checkpoints[0];
    expect(checkpoint?.weather_available).toBe(false);
    expect(checkpoint?.risk_level).toBeNull();
  });

  it('keeps valid risk segments from the success payload', async () => {
    setScenario('success');
    const { data } = await createRoutePlan(REQUEST);
    const segments = data.routes[0]?.risk_segments ?? [];
    expect(segments).toHaveLength(2);
    expect(segments[0]?.start_index).toBe(0);
    expect(segments[0]?.end_index).toBe(1);
    expect(segments[0]?.risk_level).toBe('MODERATE');
  });

  it('degrades an out-of-range segment score to null instead of failing', async () => {
    setScenario('badSegments');
    const { data } = await createRoutePlan(REQUEST);
    const segments = data.routes[0]?.risk_segments ?? [];
    expect(segments).toHaveLength(1);
    expect(segments[0]?.risk_score).toBeNull();
    expect(segments[0]?.risk_level).toBe('LOW');
  });

  it('accepts payloads that omit risk_segments entirely', async () => {
    setScenario('noSegments');
    const { data } = await createRoutePlan(REQUEST);
    expect(data.routes[0]?.risk_segments).toEqual([]);
  });
});
