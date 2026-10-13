import { AltRoute } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

import { useRoutePlanMutation } from '../../features/route-planning/hooks/useRoutePlan';
import {
  normalizeFormValues,
  type RoutePlanFormValues,
} from '../../features/route-planning/schemas';
import { RouteSidebar } from '../layout/RouteSidebar';
import { RoutePlanForm } from '../route-planning-form/RoutePlanForm';
import { RecommendationSummary } from '../route-card/RecommendationSummary';
import { RequestStatus } from '../route-card/RequestStatus';
import { RouteComparison } from '../route-card/RouteComparison';
import { WarningList } from '../route-card/WarningList';

// Lazy so the map bundle only loads once a result exists; the initial
// form route stays lightweight.
const mapChunk = (): Promise<{ default: typeof import('../route-map/RouteMapSection').RouteMapSection }> =>
  import('../route-map/RouteMapSection').then((module) => ({
    default: module.RouteMapSection,
  }));
const RouteMapSection = lazy(mapChunk);

/** Full-viewport map placeholder shown before any plan exists. */
function MapIdlePanel(): React.JSX.Element {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Paper
        variant="outlined"
        sx={{ maxWidth: 420, mx: 2, p: 3, borderRadius: 3, textAlign: 'center' }}
      >
        <AltRoute sx={{ fontSize: 40, color: 'primary.main' }} aria-hidden="true" />
        <Typography variant="h2" component="h2" gutterBottom sx={{ mt: 1 }}>
          Map preview
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Plan a trip to see routes, checkpoints, segment risk, and the weather-risk
          heatmap here. Every result also stays available as text in the planning panel.
        </Typography>
      </Paper>
    </Box>
  );
}

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
            />
          </Suspense>
        ) : (
          <MapIdlePanel />
        )}
      </Box>

      <RouteSidebar>
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
            <AltRoute color="primary" aria-hidden="true" />
            <Typography variant="h1" component="h1">
              TruckSafe
            </Typography>
          </Box>
          {mutation.isPending && <CircularProgress size={20} aria-hidden="true" />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Plan a truck route and compare weather-risk alternatives. Results use
          deterministic demonstration data, not live weather.
        </Typography>

        <RequestStatus
          state={state}
          error={error}
          routeCount={response?.routes.length ?? 0}
        />

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
                </>
              )}
            </Stack>
          )}
        </Box>
      </RouteSidebar>
    </Box>
  );
}
