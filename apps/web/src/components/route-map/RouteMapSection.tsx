import { Box, Skeleton, Typography, useMediaQuery } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import {
  normalizePlanMap,
  normalizeWeatherGrid,
  type MappableCheckpoint,
  type NormalizedWeatherGrid,
} from '../../features/route-map/geo';
import { RouteMapAdapter } from '../../features/route-map/mapAdapter';
import { mapStyleUrl } from '../../features/route-map/mapConfig';
import type { RoutePlanResponse } from '../../features/route-planning/types';
import { fetchWeatherGrid } from '../../features/route-planning/api/client';
import { weatherUserMessage } from '../../features/route-planning/api/errors';
import { theme } from '../../app/theme';
import { MapCheckpointDetail } from './MapCheckpointDetail';
import { MapControls } from './MapControls';
import { MapRouteSelection, type RouteSelectionEntry } from './MapRouteSelection';
import { RouteMapFallback } from './RouteMapFallback';
import { RouteMapLegend } from './RouteMapLegend';
import { ForecastSlider } from './ForecastSlider';

interface RouteMapSectionProps {
  response: RoutePlanResponse;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

type MapStatus = 'loading' | 'ready' | 'unavailable';

/** Debounce for slider-driven grid requests: one request per settled
 * position, never one per drag step. */
const GRID_DEBOUNCE_MS = 250;

// Offset clears the sidebar (floating panel) at md and up.
const SIDEBAR_OFFSET = { xs: 16, md: 420 };

/**
 * Full-viewport map layer for one route-plan result, lazily loaded.
 *
 * Owns the MapLibre lifecycle (one adapter per response, destroyed on
 * unmount or new result) and degrades to floating textual panels whenever
 * geometry or the map itself is unavailable. Selection stays in the page
 * so map picks and route cards never diverge. The route list, legend,
 * controls, and forecast slider float over the map instead of stacking
 * below it, keeping the map-first experience.
 */
export function RouteMapSection({
  response,
  selectedRouteId,
  onSelectRoute,
}: RouteMapSectionProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<RouteMapAdapter | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [attempt, setAttempt] = useState(0);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

  // Forecast slider state
  const [forecastOffset, setForecastOffset] = useState(0);
  const [weatherGrid, setWeatherGrid] = useState<NormalizedWeatherGrid | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const gridCacheRef = useRef<Record<number, NormalizedWeatherGrid>>({});
  const gridSeqRef = useRef(0);
  const gridAbortRef = useRef<AbortController | null>(null);

  // Floating control visibility state.
  const [checkpointsVisible, setCheckpointsVisible] = useState(true);
  const [heatmapVisible, setHeatmapVisible] = useState(true);

  const model = useMemo(
    () =>
      normalizePlanMap(response, {
        selectedRouteId,
        recommendedRouteId: response.recommended_route_id,
      }),
    [response, selectedRouteId],
  );

  const entries: RouteSelectionEntry[] = useMemo(
    () =>
      response.routes.map((route) => ({
        route,
        state: model.states[route.id] ?? 'no-geometry',
      })),
    [response, model],
  );

  const hasGeometry = model.lines.length > 0;
  const styleUrl = useMemo(() => mapStyleUrl(), []);

  // Departure time from the first route's first checkpoint (all routes share same departure)
  const departureAt = response.routes[0]?.checkpoints[0]?.eta ?? new Date().toISOString();

  const fetchGrid = useCallback(
    async (offsetHours: number) => {
      const cached = gridCacheRef.current[offsetHours];
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
        const result = await fetchWeatherGrid(response.id, offsetHours, {
          signal: controller.signal,
        });
        if (seq !== gridSeqRef.current) return;
        const normalized = normalizeWeatherGrid(result.data);
        gridCacheRef.current[offsetHours] = normalized;
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
    },
    [response.id],
  );

  // Debounced: settled slider position triggers exactly one fetch.
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchGrid(forecastOffset);
    }, GRID_DEBOUNCE_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [forecastOffset, fetchGrid]);

  // One adapter per response: create on mount/response change, destroy on
  // cleanup. The viewport fits once per response, never on selection.
  useEffect(() => {
    setSelectedCheckpointId(null);
    setCheckpointsVisible(true);
    setHeatmapVisible(true);
    if (!hasGeometry || styleUrl === '') {
      setMapStatus('unavailable');
      return;
    }
    const container = containerRef.current;
    if (container === null) {
      setMapStatus('unavailable');
      return;
    }
    let cancelled = false;
    setMapStatus('loading');
    // `created` is visible to the cleanup so a creation that finishes after
    // unmount (StrictMode remount, fast response switch) is destroyed too;
    // otherwise the abandoned instance empties the container and the live
    // second instance renders into a dead element.
    let created: RouteMapAdapter | null = null;
    RouteMapAdapter.create(container, styleUrl, {
      onRouteSelect: (routeId) => {
        onSelectRoute(routeId);
      },
      onCheckpointSelect: (checkpointId) => {
        setSelectedCheckpointId(checkpointId);
      },
      onRuntimeError: () => {
        if (cancelled) return;
        adapterRef.current?.destroy();
        adapterRef.current = null;
        setMapStatus('unavailable');
      },
    })
      .then((adapter) => {
        if (cancelled) {
          adapter.destroy();
          return;
        }
        created = adapter;
        adapterRef.current = adapter;
        try {
          adapter.setRoutes(model.lines, model.checkpoints, model.segments);
          if (model.origin !== null && model.destination !== null) {
            adapter.setMarkers({
              origin: model.origin,
              destination: model.destination,
              recommendedMidpoint: model.recommendedMidpoint,
            });
          }
          if (model.bounds !== null) adapter.fitToBounds(model.bounds);
          adapter.setSelected(selectedRouteId, null);
        } catch {
          created = null;
          adapter.destroy();
          setMapStatus('unavailable');
          return;
        }
        setMapStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setMapStatus('unavailable');
      });
    return () => {
      cancelled = true;
      created?.destroy();
      if (adapterRef.current === created) adapterRef.current = null;
    };
    // Re-create only for a new response or an explicit retry: selection
    // flows through setSelected below so manual viewport moves survive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response.id, attempt, hasGeometry, styleUrl]);

  // Update heatmap when weather grid changes.
  useEffect(() => {
    if (mapStatus === 'ready') {
      adapterRef.current?.setHeatmap(weatherGrid);
    }
  }, [mapStatus, weatherGrid]);

  // Selection emphasis without viewport refits.
  useEffect(() => {
    if (mapStatus === 'ready') {
      adapterRef.current?.setSelected(selectedRouteId, selectedCheckpointId);
    }
  }, [mapStatus, selectedRouteId, selectedCheckpointId]);

  const selectedCheckpoint: MappableCheckpoint | null =
    selectedCheckpointId === null
      ? null
      : (model.checkpoints.find((point) => point.checkpointId === selectedCheckpointId) ??
        null);
  const selectedCheckpointPayload =
    selectedCheckpoint === null
      ? null
      : (response.routes
          .find((route) => route.id === selectedCheckpoint.routeId)
          ?.checkpoints.find(
            (checkpoint) => checkpoint.checkpoint_id === selectedCheckpoint.checkpointId,
          ) ?? null);

  // Clear heatmap, cache, and in-flight requests when the plan changes;
  // the forecast offset is deliberately preserved across the new plan.
  useEffect(() => {
    gridSeqRef.current += 1;
    gridAbortRef.current?.abort();
    gridCacheRef.current = {};
    setForecastOffset(0);
    setWeatherGrid(null);
    setGridError(null);
    setGridLoading(false);
  }, [response.id]);

  // Abort grid requests on unmount.
  useEffect(() => {
    return (): void => {
      gridSeqRef.current += 1;
      gridAbortRef.current?.abort();
    };
  }, []);

  return (
    <Box
      component="section"
      aria-label="Route map"
      sx={{ position: 'absolute', inset: 0 }}
    >
      <Typography variant="h2" component="h2" sx={{ position: 'absolute', left: -9999 }}>
        Route map
      </Typography>
      {!hasGeometry ? (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: { xs: 'calc(100% - 32px)', md: 480 },
            zIndex: 4,
          }}
        >
          <RouteMapFallback reason="no-geometry" />
        </Box>
      ) : mapStatus === 'unavailable' ? (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: { xs: 'calc(100% - 32px)', md: 480 },
            zIndex: 4,
          }}
        >
          <RouteMapFallback
            reason="map-unavailable"
            onRetry={() => {
              setMapStatus('loading');
              setAttempt((count) => count + 1);
            }}
          />
        </Box>
      ) : (
        <Box
          ref={containerRef}
          role="region"
          aria-label="Interactive route map. The route list below selects the same routes."
          aria-describedby="route-map-caption"
          sx={{
            position: 'absolute',
            inset: 0,
            visibility: mapStatus === 'loading' ? 'hidden' : 'visible',
          }}
        />
      )}
      {mapStatus === 'loading' && hasGeometry && (
        <Skeleton
          variant="rectangular"
          role="progressbar"
          aria-label="Loading map"
          sx={{ position: 'absolute', inset: 0, borderRadius: 0 }}
        />
      )}
      <Typography
        id="route-map-caption"
        variant="caption"
        color="text.secondary"
        sx={{ position: 'absolute', left: -9999 }}
      >
        Map markers summarize the route list that follows; every route, checkpoint, and
        warning below stays available as text.
      </Typography>

      {/* Overlays are always available: the route list is the accessible
          source of truth and must not depend on map render success. */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            bottom: { xs: 148, md: 150 },
            width: { xs: 232, md: 300 },
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            alignItems: 'flex-end',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {mapStatus === 'ready' && (
            <Box sx={{ pointerEvents: 'auto' }}>
              <MapControls
                onRecenter={() => adapterRef.current?.recenter()}
                onZoomIn={() => adapterRef.current?.zoomBy('in')}
                onZoomOut={() => adapterRef.current?.zoomBy('out')}
                checkpointsVisible={checkpointsVisible}
                onToggleCheckpoints={() => {
                  const next = !checkpointsVisible;
                  setCheckpointsVisible(next);
                  adapterRef.current?.setCheckpointsVisible(next);
                }}
                heatmapAvailable={weatherGrid !== null}
                heatmapVisible={heatmapVisible}
                onToggleHeatmap={() => {
                  const next = !heatmapVisible;
                  setHeatmapVisible(next);
                  adapterRef.current?.setHeatmapVisible(next);
                }}
              />
            </Box>
          )}
          <Box
            sx={{
              pointerEvents: 'auto',
              overflowY: 'auto',
              minHeight: 0,
              width: '100%',
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'rgba(255, 255, 255, 0.92)',
              boxShadow: 3,
            }}
          >
            <MapRouteSelection
              entries={entries}
              selectedRouteId={selectedRouteId}
              onSelectRoute={onSelectRoute}
            />
          </Box>
        </Box>
        <Box
          sx={{
            position: 'absolute',
            bottom: { xs: 148, md: 16 },
            left: SIDEBAR_OFFSET,
            right: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 1,
            flexWrap: 'wrap',
            // The row spans the full map width; only its children may
            // receive clicks, or the empty area would block the panels
            // beneath it.
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Box sx={{ pointerEvents: 'auto' }}>
            <RouteMapLegend defaultCollapsed={!isDesktop} />
          </Box>
          <Box
            component="section"
            aria-label="Weather forecast timeline"
            sx={{
              pointerEvents: 'auto',
              flex: '1 1 320px',
              maxWidth: 560,
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'rgba(255, 255, 255, 0.92)',
              boxShadow: 3,
            }}
          >
            <ForecastSlider
              value={forecastOffset}
              onChange={setForecastOffset}
              departureAt={departureAt}
              loading={gridLoading}
              error={gridError}
            />
          </Box>
        </Box>
        {selectedCheckpoint !== null && selectedCheckpointPayload !== null && (
          <Box
            sx={{
              position: 'absolute',
              top: 16,
              left: SIDEBAR_OFFSET,
              maxWidth: 360,
              pointerEvents: 'auto',
            }}
          >
            <MapCheckpointDetail
              checkpoint={selectedCheckpointPayload}
              role={selectedCheckpoint.role}
              onClose={() => setSelectedCheckpointId(null)}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
