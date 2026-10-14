import { Box, Skeleton, Typography, useMediaQuery } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import {
  normalizePlanMap,
  type CheckpointSelection,
  type LngLat,
  type MappableCheckpoint,
  type NormalizedWeatherGrid,
} from '../../features/route-map/geo';
import { RouteMapAdapter } from '../../features/route-map/mapAdapter';
import { mapStyleUrl } from '../../features/route-map/mapConfig';
import { routeLabelsById } from '../../features/route-planning/labels';
import {
  checkpointPopupText,
  heatCellPopupText,
} from '../../features/route-map/popupText';
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
  /** Checkpoint selected in the map or the sidebar list; null clears it. */
  selectedCheckpoint: CheckpointSelection | null;
  onSelectCheckpoint: (selection: CheckpointSelection | null) => void;
  /** Latest forecast grid; the slider lives in the bottom sheet. */
  weatherGrid: NormalizedWeatherGrid | null;
  /** Routes hidden from the map (cards stay visible); empty shows all. */
  hiddenRouteIds?: readonly string[];
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
  selectedCheckpoint,
  onSelectCheckpoint,
  weatherGrid,
  hiddenRouteIds = [],
}: RouteMapSectionProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<RouteMapAdapter | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [attempt, setAttempt] = useState(0);
  // Latest grid for heat-cell popups; a ref so map callbacks never go
  // stale without recreating the map.
  const weatherGridRef = useRef(weatherGrid);
  // Selection refs so a retried creation restores the live pick instead
  // of a stale closure value.
  const selectedRouteRef = useRef(selectedRouteId);
  const selectedCheckpointRef = useRef(selectedCheckpoint);

  useEffect(() => {
    weatherGridRef.current = weatherGrid;
  }, [weatherGrid]);
  useEffect(() => {
    selectedRouteRef.current = selectedRouteId;
    selectedCheckpointRef.current = selectedCheckpoint;
  }, [selectedRouteId, selectedCheckpoint]);

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
      onCheckpointSelect: (selection) => {
        onSelectCheckpoint(selection);
      },
      onHeatCellSelect: (cellId, at) => {
        const cell = weatherGridRef.current?.cells.find(
          (candidate) => candidate.cellId === cellId,
        );
        if (cell !== undefined)
          adapterRef.current?.showPopup(at, heatCellPopupText(cell));
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
          adapter.setSelected(selectedRouteRef.current, selectedCheckpointRef.current);
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
      adapterRef.current?.setSelected(selectedRouteId, selectedCheckpoint);
    }
  }, [mapStatus, selectedRouteId, selectedCheckpoint]);
  // Route visibility without refits; hiding never changes the selection.
  useEffect(() => {
    if (mapStatus === 'ready') {
      adapterRef.current?.setHiddenRoutes(hiddenRouteIds);
    }
  }, [mapStatus, hiddenRouteIds]);

  const selectedPoint: MappableCheckpoint | null =
    selectedCheckpoint === null
      ? null
      : (model.checkpoints.find(
          (point) =>
            point.routeId === selectedCheckpoint.routeId &&
            point.checkpointId === selectedCheckpoint.checkpointId,
        ) ?? null);
  const selectedCheckpointPayload =
    selectedPoint === null
      ? null
      : (response.routes
          .find((route) => route.id === selectedPoint.routeId)
          ?.checkpoints.find(
            (checkpoint) => checkpoint.checkpoint_id === selectedPoint.checkpointId,
          ) ?? null);

  // Checkpoint picks (from the map or the sidebar list) pan the
  // viewport and raise a details popup; clearing the pick closes it.
  useEffect(() => {
    if (mapStatus !== 'ready') return;
    if (selectedPoint === null || selectedCheckpointPayload === null) {
      adapterRef.current?.closePopup();
      return;
    }
    const at: LngLat = [selectedPoint.longitude, selectedPoint.latitude];
    adapterRef.current?.focusPoint(at);
    const routeLabel = routeLabelsById(response.routes)[selectedPoint.routeId];
    adapterRef.current?.showPopup(
      at,
      checkpointPopupText(selectedCheckpointPayload, routeLabel),
    );
  }, [mapStatus, response.routes, selectedPoint, selectedCheckpointPayload]);

  return (
    <Box
      component="section"
      aria-label="Route map"
      data-tour="route-map"
      sx={{
        position: 'absolute',
        inset: 0,
        // MapLibre popups render plain text: honor the newlines the
        // popup builders emit instead of collapsing them.
        '& .maplibregl-popup-content': { whiteSpace: 'pre-line' },
      }}
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
        {selectedPoint !== null && selectedCheckpointPayload !== null && (
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
              role={selectedPoint.role}
              routeId={selectedPoint.routeId}
              routeLabel={routeLabelsById(response.routes)[selectedPoint.routeId]}
              onClose={() => onSelectCheckpoint(null)}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
