import { Box, Skeleton, Typography, useMediaQuery } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import {
  normalizePlanMap,
  type MappableCheckpoint,
  type NormalizedWeatherGrid,
} from '../../features/route-map/geo';
import { RouteMapAdapter } from '../../features/route-map/mapAdapter';
import { mapStyleUrl } from '../../features/route-map/mapConfig';
import type { RoutePlanResponse } from '../../features/route-planning/types';
import { theme } from '../../app/theme';
import { MapCheckpointDetail } from './MapCheckpointDetail';
import { MapControls } from './MapControls';
import { RouteMapFallback } from './RouteMapFallback';
import { RouteMapLegend } from './RouteMapLegend';

interface RouteMapSectionProps {
  response: RoutePlanResponse;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  /** Latest forecast grid; the slider lives in the bottom sheet. */
  weatherGrid: NormalizedWeatherGrid | null;
}

type MapStatus = 'loading' | 'ready' | 'unavailable';

// Offset clears the sidebar (floating panel) at md and up.
const SIDEBAR_OFFSET = { xs: 16, md: 420 };

/**
 * Full-viewport map layer for one route-plan result, lazily loaded.
 *
 * Owns the MapLibre lifecycle (one adapter per response, destroyed on
 * unmount or new result) and degrades to floating textual panels whenever
 * geometry or the map itself is unavailable. Route selection lives in the
 * bottom-sheet route cards (plus direct map picks): this section renders
 * no second selection surface. The forecast slider lives in the bottom
 * sheet too; this section only paints the heatmap it produces.
 */
export function RouteMapSection({
  response,
  selectedRouteId,
  onSelectRoute,
  weatherGrid,
}: RouteMapSectionProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<RouteMapAdapter | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [attempt, setAttempt] = useState(0);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

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

  const hasGeometry = model.lines.length > 0;
  const styleUrl = useMemo(() => mapStyleUrl(), []);

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
          aria-label="Interactive route map. The route cards select the same routes."
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
        Map markers summarize the route cards; every route, checkpoint, and warning stays
        available as text in the results panel.
      </Typography>

      {/* Overlays are assistive only: route selection lives in the
          bottom-sheet route cards (plus direct map picks), and the
          forecast slider lives in the bottom sheet too. Nothing floating
          here may duplicate them or cover route content. */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
        <Box
          sx={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top) + 16px)',
            right: 'calc(env(safe-area-inset-right) + 16px)',
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
        </Box>
        <Box
          sx={{
            position: 'absolute',
            bottom: { xs: 148, md: 16 },
            left: SIDEBAR_OFFSET,
            // The legend row keeps clear of the bottom sheet; only its
            // child may receive clicks, or the empty area would block the
            // panels beneath it.
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Box sx={{ pointerEvents: 'auto' }}>
            <RouteMapLegend defaultCollapsed={!isDesktop} />
          </Box>
        </Box>
        {selectedCheckpoint !== null && selectedCheckpointPayload !== null && (
          <Box
            sx={{
              position: 'absolute',
              top: 'calc(env(safe-area-inset-top) + 16px)',
              left: SIDEBAR_OFFSET,
              right: { xs: 16, md: 'auto' },
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
