import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useRef } from 'react';

import { useRoutePlanMutation } from '../../features/route-planning/hooks/useRoutePlan';
import {
  normalizeFormValues,
  type RoutePlanFormValues,
} from '../../features/route-planning/schemas';
import { RoutePlanForm } from '../route-planning-form/RoutePlanForm';
import { RecommendationSummary } from '../route-card/RecommendationSummary';
import { RequestStatus } from '../route-card/RequestStatus';
import { RouteComparison } from '../route-card/RouteComparison';
import { WarningList } from '../route-card/WarningList';

/**
 * Single-page route-planning workflow: form, status, and results.
 * A new submission always clears the previous result first, so stale
 * results are never presented as current.
 */
export function RoutePlanPage(): React.JSX.Element {
  const mutation = useRoutePlanMutation();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return (): void => {
      // Read the ref inside the cleanup so unmount aborts whichever
      // request is in flight, not the (empty) value at mount time.
      abortRef.current?.abort();
    };
  }, []);

  const handleSubmit = useCallback(
    (values: RoutePlanFormValues) => {
      mutation.reset();
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
  }, [mutation]);

  const error = mutation.error;
  const response = mutation.isSuccess ? mutation.data.data : null;
  const requestId = mutation.isSuccess
    ? mutation.data.requestId
    : (error?.requestId ?? null);
  const state = mutation.isPending
    ? 'pending'
    : mutation.isError
      ? 'error'
      : mutation.isSuccess
        ? 'success'
        : 'idle';

  return (
    <Stack spacing={3}>
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

      <RequestStatus
        state={state}
        error={error}
        routeCount={response?.routes.length ?? 0}
      />

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
              />
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
