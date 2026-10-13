import { Box } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import { RouteMapAdapter } from '../../features/route-map/mapAdapter';
import { mapStyleUrl } from '../../features/route-map/mapConfig';
import type { CityCoordinates } from '../../features/route-planning/cities';
import { RouteMapFallback } from './RouteMapFallback';

type FocusStatus = 'loading' | 'ready' | 'unavailable';

/** City-level zoom for the pre-plan viewport. */
const FOCUS_ZOOM = 10;

interface OriginFocusMapProps {
  /**
   * City to center on. Null keeps the current viewport (unknown free
   * text never yanks the map somewhere unrelated).
   */
  center: CityCoordinates | null;
  /** City name announced with the map region. */
  cityName: string;
}

/**
 * Background map shown before any plan exists. It renders the same
 * MapLibre style as the results map, centered on the origin city, and
 * follows origin edits. Routes, heatmap, and slider appear only with a
 * result (`RouteMapSection` replaces this component then).
 */
export function OriginFocusMap({
  center,
  cityName,
}: OriginFocusMapProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<RouteMapAdapter | null>(null);
  const [status, setStatus] = useState<FocusStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const styleUrl = mapStyleUrl();

  // Create once (plus explicit retries); the viewport follows separately
  // so typing an origin never rebuilds the map.
  useEffect(() => {
    if (styleUrl === '') {
      setStatus('unavailable');
      return;
    }
    const container = containerRef.current;
    if (container === null) {
      setStatus('unavailable');
      return;
    }
    let cancelled = false;
    let created: RouteMapAdapter | null = null;
    setStatus('loading');
    RouteMapAdapter.create(container, styleUrl, {
      onRuntimeError: () => {
        if (cancelled) return;
        adapterRef.current?.destroy();
        adapterRef.current = null;
        setStatus('unavailable');
      },
    })
      .then((adapter) => {
        if (cancelled) {
          adapter.destroy();
          return;
        }
        created = adapter;
        adapterRef.current = adapter;
        // Viewport follows via the effect below once status is ready.
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
      created?.destroy();
      if (adapterRef.current === created) adapterRef.current = null;
    };
    // Center changes are applied by the follower effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, styleUrl]);

  useEffect(() => {
    if (center !== null && status === 'ready') {
      adapterRef.current?.focus([center.longitude, center.latitude], FOCUS_ZOOM);
    }
  }, [center, status]);

  const retry = (): void => {
    setAttempt((value) => value + 1);
  };

  return (
    <Box sx={{ position: 'absolute', inset: 0 }}>
      {status === 'unavailable' ? (
        <RouteMapFallback reason="map-unavailable" onRetry={retry} />
      ) : (
        <Box
          ref={containerRef}
          role="region"
          aria-label={`Interactive route map. Showing ${cityName}. Plan a trip to see routes here.`}
          sx={{
            position: 'absolute',
            inset: 0,
            visibility: status === 'loading' ? 'hidden' : 'visible',
          }}
        />
      )}
    </Box>
  );
}
