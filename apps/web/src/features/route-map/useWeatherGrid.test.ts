import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWeatherGrid } from './useWeatherGrid';

function gridBody() {
  return {
    route_id: 'route-1',
    route_plan_id: 'plan-1',
    forecast_start: '2026-10-12T14:00:00Z',
    forecast_end: '2026-10-12T15:00:00Z',
    cells: [
      {
        cell_id: 'cell-1',
        latitude: 41.88,
        longitude: -87.63,
        valid_at: '2026-10-12T14:00:00Z',
        risk_level: 'LOW',
        risk_score: 1,
        risk_reasons: ['wind'],
        weather: {
          wind_mph: 10,
          rain_inches_per_hour: 0,
          snow_inches_per_hour: 0,
        },
      },
    ],
  };
}

function stubFetchOk(calls: string[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      calls.push(String(url));
      return new Response(JSON.stringify(gridBody()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useWeatherGrid', () => {
  it('stays idle without a plan and fetches offset 0 once planned', async () => {
    const calls: string[] = [];
    stubFetchOk(calls);
    const { result, rerender } = renderHook(
      ({ planId }: { planId: string | null }) => useWeatherGrid(planId),
      { initialProps: { planId: null as string | null } },
    );
    expect(result.current.weatherGrid).toBeNull();
    expect(calls).toHaveLength(0);

    rerender({ planId: 'plan-1' });
    await waitFor(() => expect(result.current.weatherGrid).not.toBeNull());
    expect(result.current.forecastOffset).toBe(0);
    expect(result.current.gridError).toBeNull();
    expect(calls.filter((url) => url.includes('offset_hours=0'))).toHaveLength(1);
    expect(result.current.weatherGrid?.cells).toHaveLength(1);
  });

  it('serves repeat offsets from cache without refetching', async () => {
    const calls: string[] = [];
    stubFetchOk(calls);
    const { result } = renderHook(() => useWeatherGrid('plan-1'));
    await waitFor(() => expect(result.current.weatherGrid).not.toBeNull());
    expect(calls).toHaveLength(1);

    // jsdom timers: bump the offset twice and wait for the debounced fetch.
    result.current.setForecastOffset(24);
    await waitFor(() =>
      expect(calls.some((url) => url.includes('offset_hours=24'))).toBe(true),
    );
    const afterFirst = calls.length;
    result.current.setForecastOffset(0);
    await waitFor(() => expect(result.current.forecastOffset).toBe(0));
    // Offset 0 is cached from the initial load: no new request.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calls.length).toBe(afterFirst);
  });

  it('resets the offset and grid when the plan changes', async () => {
    const calls: string[] = [];
    stubFetchOk(calls);
    const { result, rerender } = renderHook(
      ({ planId }: { planId: string | null }) => useWeatherGrid(planId),
      { initialProps: { planId: 'plan-1' } },
    );
    await waitFor(() => expect(result.current.weatherGrid).not.toBeNull());
    rerender({ planId: 'plan-2' });
    await waitFor(() => expect(result.current.forecastOffset).toBe(0));
    expect(result.current.weatherGrid).toBeNull();
  });

  it('surfaces provider failures without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await Promise.resolve();
        throw new Error('network down');
      }),
    );
    const { result } = renderHook(() => useWeatherGrid('plan-9'));
    await waitFor(() => expect(result.current.gridError).not.toBeNull());
    expect(result.current.weatherGrid).toBeNull();
    expect(result.current.gridLoading).toBe(false);
  });
});
