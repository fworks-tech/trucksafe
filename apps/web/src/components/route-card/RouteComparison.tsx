import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { Box, IconButton, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

import { routeLabelsById } from '../../features/route-planning/labels';
import type { RoutePayload } from '../../features/route-planning/types';
import { RouteCard } from './RouteCard';

interface RouteComparisonProps {
  routes: RoutePayload[];
  recommendedRouteId: string | null;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

/**
 * Side-by-side alternatives as a one-card-at-a-time carousel. Native
 * scroll-snap handles swipe and keyboard scrolling; arrows and dots are
 * convenience, never the only way to reach a card.
 */
export function RouteComparison({
  routes,
  recommendedRouteId,
  selectedRouteId,
  onSelectRoute,
}: RouteComparisonProps): React.JSX.Element {
  const labels = routeLabelsById(routes);
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const many = routes.length > 1;

  const scrollTo = useCallback((index: number): void => {
    const track = trackRef.current;
    if (track === null) return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // jsdom and older engines lack Element.scrollTo; state still drives
    // the arrows/dots, so scrolling is a progressive enhancement.
    track.scrollTo?.({
      left: index * track.clientWidth,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
    setPage(index);
  }, []);

  // Keep the visible card in sync with the selection (initially the
  // backend recommendation, later any card/map pick).
  useEffect(() => {
    const index = routes.findIndex((route) => route.id === selectedRouteId);
    if (index > 0) scrollTo(index);
  }, [routes, selectedRouteId, scrollTo]);

  // The sidebar tab panel is display:none until results auto-switch the
  // tab, so the first sync can measure zero width; reposition once the
  // track is actually laid out.
  useEffect(() => {
    const track = trackRef.current;
    if (track === null || typeof ResizeObserver === 'undefined') return;
    const index = routes.findIndex((route) => route.id === selectedRouteId);
    if (index <= 0) return;
    const observer = new ResizeObserver(() => {
      if (track.clientWidth > 0 && track.scrollLeft < track.clientWidth * (index - 0.5)) {
        track.scrollTo?.({ left: index * track.clientWidth });
      }
    });
    observer.observe(track);
    return (): void => {
      observer.disconnect();
    };
  }, [routes, selectedRouteId]);

  return (
    <section aria-label="Route alternatives">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography variant="h2" component="h2" gutterBottom>
          Route alternatives ({routes.length})
        </Typography>
        {many && (
          <Box
            role="group"
            aria-label="Route alternatives navigation"
            sx={{ display: 'flex', gap: 0.5 }}
          >
            <IconButton
              aria-label="Previous route"
              size="small"
              disabled={page === 0}
              onClick={() => scrollTo(Math.max(0, page - 1))}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              aria-label="Next route"
              size="small"
              disabled={page === routes.length - 1}
              onClick={() => scrollTo(Math.min(routes.length - 1, page + 1))}
            >
              <ChevronRight />
            </IconButton>
          </Box>
        )}
      </Box>
      <Box
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget;
          if (track.clientWidth > 0) {
            setPage(Math.round(track.scrollLeft / track.clientWidth));
          }
        }}
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: many ? 'auto' : 'hidden',
          scrollSnapType: 'x mandatory',
          pb: 1,
          // The arrows and dots are the discoverable control; hide the
          // browser scrollbar without removing scrollability.
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {routes.map((route) => (
          <Box
            key={route.id}
            sx={{
              flex: '0 0 100%',
              minWidth: 0,
              scrollSnapAlign: 'start',
            }}
          >
            <RouteCard
              route={route}
              label={labels[route.id] ?? route.id}
              recommended={route.id === recommendedRouteId}
              selected={route.id === selectedRouteId}
              onSelect={onSelectRoute}
            />
          </Box>
        ))}
      </Box>
      {many && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, pt: 0.5 }}>
          {routes.map((route, index) => (
            <IconButton
              key={route.id}
              size="small"
              aria-label={`Show ${labels[route.id] ?? route.id}`}
              onClick={() => scrollTo(index)}
              sx={{
                width: 28,
                height: 28,
                p: 0,
                '&::after': {
                  content: '""',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: page === index ? 'primary.main' : 'action.disabled',
                },
              }}
            />
          ))}
        </Box>
      )}
    </section>
  );
}
