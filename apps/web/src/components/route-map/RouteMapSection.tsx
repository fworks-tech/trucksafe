import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import { normalizePlanMap, type MappableCheckpoint } from '../../features/route-map/geo';
import { RouteMapAdapter } from '../../features/route-map/mapAdapter';
import { mapStyleUrl } from '../../features/route-map/mapConfig';
import type { RoutePlanResponse } from '../../features/route-planning/types';
import { MapCheckpointDetail } from './MapCheckpointDetail';
import { MapRouteSelection, type RouteSelectionEntry } from './MapRouteSelection';
import { RouteMapFallback } from './RouteMapFallback';
import { RouteMapLegend } from './RouteMapLegend';

interface RouteMapSectionProps {
  response: RoutePlanResponse;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

type MapStatus = 'loading' | 'ready' | 'unavailable';

const MAP_HEIGHT = { xs: 320, md: 440 };

/** Interactive map for one route-plan result, lazily loaded.
 *
 * Owns the MapLibre lifecycle (one adapter per response, destroyed on
 * unmount or new result) and degrades to the textual comparison whenever
 * geometry or the map itself is unavailable. Selection stays in the page
 * so map picks and route cards never diverge.
 */
export function RouteMapSection({
  response,
  selectedRouteId,
  onSelectRoute,
}: RouteMapSectionProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<RouteMapAdapter | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

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

  // One adapter per response: create on mount/response change, destroy on
  // cleanup. The viewport fits once per response, never on selection.
  useEffect(() => {
    setSelectedCheckpointId(null);
    setSelectedCheckpointId(null);
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
    let adapter: RouteMapAdapter | null = null;
    RouteMapAdapter.create(container, styleUrl, {
      onRouteSelect: (routeId) => {
        onSelectRoute(routeId);
      },
      onCheckpointSelect: (checkpointId) => {
        setSelectedCheckpointId(checkpointId);
      },
      onRuntimeError: () => {
        if (cancelled) return;
        // The map is detached with the fallback; drop the instance so a
        // retry starts clean instead of leaking listeners.
        adapterRef.current?.destroy();
        adapterRef.current = null;
        setMapStatus('unavailable');
      },
    })
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        adapter = created;
        adapterRef.current = created;
        created.setRoutes(model.lines, model.checkpoints);
        if (model.origin !== null && model.destination !== null) {
          created.setMarkers({
            origin: model.origin,
            destination: model.destination,
            recommendedMidpoint: model.recommendedMidpoint,
          });
        }
        if (model.bounds !== null) created.fitToBounds(model.bounds);
        created.setSelected(selectedRouteId, null);
        setMapStatus('ready');
      })
      .catch(() => {
        // Any initialization failure degrades to the textual comparison.
        if (!cancelled) setMapStatus('unavailable');
      });
    return () => {
      cancelled = true;
      adapter?.destroy();
      adapterRef.current = null;
    };
    // Re-create only for a new response or an explicit retry: selection
    // flows through setSelected below so manual viewport moves survive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response.id, attempt, hasGeometry, styleUrl]);

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
    <section aria-label="Route map">
      <Typography variant="h2" component="h2" gutterBottom>
        Route map
      </Typography>
      <Stack spacing={2}>
        {!hasGeometry ? (
          <RouteMapFallback reason="no-geometry" />
        ) : mapStatus === 'unavailable' ? (
          <RouteMapFallback
            reason="map-unavailable"
            onRetry={() => {
              // Show the mount box again before re-creating the adapter.
              setMapStatus('loading');
              setAttempt((count) => count + 1);
            }}
          />
        ) : (
          <Box sx={{ position: 'relative' }}>
            <Box
              ref={containerRef}
              role="region"
              aria-label="Interactive route map. The route list below selects the same routes."
              aria-describedby="route-map-caption"
              sx={{
                height: MAP_HEIGHT,
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid #cfd8dc',
                // Reserve the full box during load so nothing shifts.
                visibility: mapStatus === 'loading' ? 'hidden' : 'visible',
              }}
            />
            {mapStatus === 'loading' && (
              <Skeleton
                variant="rectangular"
                // An aria-label on a plain span is prohibited (WCAG 4.1.2);
                // the progressbar role is what makes the announcement legal.
                role="progressbar"
                aria-label="Loading map"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  height: MAP_HEIGHT,
                  borderRadius: 2,
                }}
              />
            )}
          </Box>
        )}
        <Typography id="route-map-caption" variant="caption" color="text.secondary">
          Map markers summarize the route list that follows; every route, checkpoint, and
          warning below stays available as text.
        </Typography>
        <RouteMapLegend />
        <MapRouteSelection
          entries={entries}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
        />
        {selectedCheckpoint !== null && selectedCheckpointPayload !== null && (
          <MapCheckpointDetail
            checkpoint={selectedCheckpointPayload}
            role={selectedCheckpoint.role}
            onClose={() => setSelectedCheckpointId(null)}
          />
        )}
      </Stack>
    </section>
  );
}
