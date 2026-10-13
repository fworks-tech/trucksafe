import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchWeatherGrid,
  type FetchWeatherGridResult,
} from '../route-planning/api/client';
import { weatherUserMessage } from '../route-planning/api/errors';
import { normalizeWeatherGrid, type NormalizedWeatherGrid } from './geo';

/** Debounce for slider-driven grid requests: one request per settled
 * position, never one per drag step. */
const GRID_DEBOUNCE_MS = 250;

export interface WeatherGridState {
  /** Current forecast offset in hours (0-48). */
  forecastOffset: number;
  setForecastOffset: (offset: number) => void;
  /** Latest grid for the current offset, or null while loading/failed. */
  weatherGrid: NormalizedWeatherGrid | null;
  gridLoading: boolean;
  gridError: string | null;
}

/**
 * Forecast-grid state for one route plan, shared by the bottom-sheet
 * slider and the map heatmap.
 *
 * Responses are cached per plan and offset; only the newest request may
 * commit state (stale-response guard), and everything resets when the
 * plan changes. A null plan id yields the idle state without fetching.
 */
export function useWeatherGrid(planId: string | null): WeatherGridState {
  const [forecastOffset, setForecastOffset] = useState(0);
  const [weatherGrid, setWeatherGrid] = useState<NormalizedWeatherGrid | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const gridCacheRef = useRef<Record<string, NormalizedWeatherGrid>>({});
  const gridSeqRef = useRef(0);
  const gridAbortRef = useRef<AbortController | null>(null);

  const fetchGrid = useCallback(async (targetPlanId: string, offsetHours: number) => {
    const cacheKey = `${targetPlanId}:${offsetHours}`;
    const cached = gridCacheRef.current[cacheKey];
    if (cached !== undefined) {
      setWeatherGrid(cached);
      setGridError(null);
      return;
    }
    // Stale-response guard: only the newest request may commit state.
    const seq = (gridSeqRef.current += 1);
    gridAbortRef.current?.abort();
    const controller = new AbortController();
    gridAbortRef.current = controller;
    setGridLoading(true);
    setGridError(null);
    try {
      const result: FetchWeatherGridResult = await fetchWeatherGrid(
        targetPlanId,
        offsetHours,
        { signal: controller.signal },
      );
      if (seq !== gridSeqRef.current) return;
      const normalized = normalizeWeatherGrid(result.data);
      gridCacheRef.current[cacheKey] = normalized;
      setWeatherGrid(normalized);
    } catch (error) {
      if (seq !== gridSeqRef.current) return;
      // Weather-specific wording: a failed forecast must never claim the
      // route plan could not be created when the plan itself succeeded.
      setGridError(weatherUserMessage(error));
      setWeatherGrid(null);
    } finally {
      if (seq === gridSeqRef.current) setGridLoading(false);
    }
  }, []);

  // Debounced: the settled slider position triggers exactly one fetch.
  useEffect(() => {
    if (planId === null) return;
    const timer = setTimeout(() => {
      void fetchGrid(planId, forecastOffset);
    }, GRID_DEBOUNCE_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [planId, forecastOffset, fetchGrid]);

  // Clear heatmap, cache, and in-flight requests when the plan changes.
  useEffect(() => {
    gridSeqRef.current += 1;
    gridAbortRef.current?.abort();
    gridCacheRef.current = {};
    setForecastOffset(0);
    setWeatherGrid(null);
    setGridError(null);
    setGridLoading(false);
  }, [planId]);

  // Abort grid requests on unmount.
  useEffect(() => {
    return (): void => {
      gridSeqRef.current += 1;
      gridAbortRef.current?.abort();
    };
  }, []);

  return { forecastOffset, setForecastOffset, weatherGrid, gridLoading, gridError };
}
