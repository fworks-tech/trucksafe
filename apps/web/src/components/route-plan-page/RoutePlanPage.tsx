import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRoutePlanMutation } from '../../features/route-planning/hooks/useRoutePlan';
import { useWeatherGrid } from '../../features/route-map/useWeatherGrid';
import {
  DEFAULT_ORIGIN_CITY,
  lookupCityCoordinates,
} from '../../features/route-planning/cities';
import {
  normalizeFormValues,
  type RoutePlanFormValues,
} from '../../features/route-planning/schemas';
import { RouteSidebar } from '../layout/RouteSidebar';
import { RoutePlanForm } from '../route-planning-form/RoutePlanForm';
import { OriginFocusMap } from '../route-map/OriginFocusMap';
import { ForecastSection } from '../route-map/ForecastSection';
import { RecommendationSummary } from '../route-card/RecommendationSummary';
import { RequestStatus } from '../route-card/RequestStatus';
import { RouteComparison } from '../route-card/RouteComparison';
import { WarningList } from '../route-card/WarningList';

// Lazy so the map bundle only loads once a result exists; the initial
// form route stays lightweight.
const mapChunk = (): Promise<{
  default: typeof import('../route-map/RouteMapSection').RouteMapSection;
}> =>
  import('../route-map/RouteMapSection').then((module) => ({
    default: module.RouteMapSection,
  }));
const RouteMapSection = lazy(mapChunk);

/**
 * Map-first route-planning workflow: a full-viewport map with a floating
 * planning sidebar (bottom sheet on small screens).
 * A new submission always clears the previous result first, so stale
 * results are never presented as current.
 */
export function RoutePlanPage(): React.JSX.Element {
  const mutation = useRoutePlanMutation();
  const abortRef = useRef<AbortController | null>(null);
  // Viewing selection shared by the map and the route cards. Derived
  // from the backend recommendation; never stored server-side.
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'routes'>('plan');
  // Origin city driving the pre-plan background map. Unknown free text
  // keeps the previous viewport (lookup returns null, center is unchanged).
  const [originCity, setOriginCity] = useState<string>(DEFAULT_ORIGIN_CITY);
  // Memoized by city name so unrelated re-renders keep a stable
  // reference and never refire the map-focus effect (which would snap
  // back a manually panned viewport).
  const focusCenter = useMemo(() => lookupCityCoordinates(originCity), [originCity]);

  useEffect(() => {
    return (): void => {
      // Read the ref inside the cleanup so unmount aborts whichever
      // request is in flight, not the (empty) value at mount time.
      abortRef.current?.abort();
    };
  }, []);

  // The app is map-first: prefetch the map chunk shortly after mount so
  // the result render never suspends on a cold (dev-transformed) chunk.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void mapChunk();
    }, 1500);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, []);

  const handleSubmit = useCallback(
    (values: RoutePlanFormValues) => {
      mutation.reset();
      setSelectedRouteId(null);
      setActiveTab('plan');
      void mapChunk();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      mutation.mutate({
        input: normalizeFormValues(values),
        signal: controller.signal,
      });
    },
    [mutation],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleNewPlan = useCallback(() => {
    abortRef.current?.abort();
    mutation.reset();
    setSelectedRouteId(null);
    setActiveTab('plan');
  }, [mutation]);

  const handleSelectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
  }, []);

  const error = mutation.error;
  const response = mutation.isSuccess ? mutation.data.data : null;
  // Forecast grid state shared by the bottom-sheet slider and the map
  // heatmap. Null before the first plan: idle, no requests.
  const forecast = useWeatherGrid(response?.id ?? null);
  const requestId = mutation.isSuccess
    ? mutation.data.requestId
    : (error?.requestId ?? null);
  // Default to the backend recommendation; fall back to the first route
  // when nothing is recommended. A stale id (e.g. after a new plan)
  // resolves to the same default instead of a missing route.
  const effectiveSelection =
    response !== null && response.routes.some((route) => route.id === selectedRouteId)
      ? selectedRouteId
      : (response?.recommended_route_id ?? response?.routes[0]?.id ?? null);
  const state = mutation.isPending
    ? 'pending'
    : mutation.isError
      ? 'error'
      : mutation.isSuccess
        ? 'success'
        : 'idle';

  // Results become visible the moment they exist; the user can always
  // switch back to the Plan tab while a result is kept.
  useEffect(() => {
    if (response !== null && response.routes.length > 0) {
      setActiveTab('routes');
    }
  }, [response]);

  return (
    <Box sx={{ position: 'absolute', inset: 0 }}>
      <Box component="div" sx={{ position: 'absolute', inset: 0 }}>
        {response !== null ? (
          <Suspense fallback={null}>
            <RouteMapSection
              response={response}
              selectedRouteId={effectiveSelection}
              onSelectRoute={handleSelectRoute}
              weatherGrid={forecast.weatherGrid}
            />
          </Suspense>
        ) : (
          <OriginFocusMap center={focusCenter} cityName={originCity} />
        )}
      </Box>

      <RouteSidebar
        header={
          <Box sx={{ mt: 1 }}>
            <Tabs
              value={activeTab}
              onChange={(_event: React.SyntheticEvent, value: string) =>
                setActiveTab(value as 'plan' | 'routes')
              }
              aria-label="Route planning steps"
              variant="fullWidth"
            >
              <Tab id="tab-plan" label="Plan Trip" value="plan" />
              <Tab
                id="tab-routes"
                label="Routes"
                value="routes"
                disabled={response === null}
              />
            </Tabs>
          </Box>
        }
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h1" component="h1" sx={{ m: 0 }}>
              <Box
                component="img"
                src="/logo-sidebar.png"
                alt="TruckSafe"
                sx={{ display: 'block', height: 48 }}
              />
            </Typography>
          </Box>
          {mutation.isPending && <CircularProgress size={20} aria-hidden="true" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Plan a truck route and compare weather-risk alternatives. Forecast weather is
          simulated, not live.
        </Typography>

        {response !== null && response.mock_mode && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Demonstration geometry — this plan uses the mock routing provider, not live
            road data. Routes are straight corridors, and load rules still apply in
            pounds.
          </Alert>
        )}

        <RequestStatus
          state={state}
          error={error}
          routeCount={response?.routes.length ?? 0}
        />

        <Box
          role="tabpanel"
          id="tabpanel-plan"
          aria-labelledby="tab-plan"
          sx={{ display: activeTab === 'plan' ? 'block' : 'none', pt: 1 }}
        >
          <section aria-label="New route plan">
            <Typography variant="h2" component="h2" gutterBottom>
              New route plan
            </Typography>
            <RoutePlanForm
              onSubmit={handleSubmit}
              isPending={mutation.isPending}
              onCancel={handleCancel}
              onOriginChange={setOriginCity}
            />
          </section>
        </Box>

        <Box
          role="tabpanel"
          id="tabpanel-routes"
          aria-labelledby="tab-routes"
          sx={{ display: activeTab === 'routes' ? 'block' : 'none', pt: 1 }}
        >
          {response !== null && (
            <Stack spacing={2}>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography variant="h2" component="h2">
                  Result
                </Typography>
                <Button type="button" variant="outlined" onClick={handleNewPlan}>
                  Start new plan
                </Button>
              </Box>
              {response.routes.length === 0 ? (
                <Alert severity="error" role="alert">
                  We could not create the route plan. Please try again.
                </Alert>
              ) : (
                <>
                  <RecommendationSummary response={response} requestId={requestId} />
                  <WarningList warnings={response.warnings} />
                  <RouteComparison
                    routes={response.routes}
                    recommendedRouteId={response.recommended_route_id}
                    selectedRouteId={effectiveSelection}
                    onSelectRoute={handleSelectRoute}
                  />
                  <ForecastSection
                    value={forecast.forecastOffset}
                    onChange={forecast.setForecastOffset}
                    departureAt={
                      response.routes[0]?.checkpoints[0]?.eta ?? new Date().toISOString()
                    }
                    loading={forecast.gridLoading}
                    error={forecast.gridError}
                  />
                </>
              )}
            </Stack>
          )}
        </Box>
      </RouteSidebar>
    </Box>
  );
}
