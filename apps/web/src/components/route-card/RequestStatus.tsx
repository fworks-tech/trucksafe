import { Alert, Box, CircularProgress, Typography } from '@mui/material';

import type { RoutePlanApiError } from '../../features/route-planning/api/errors';
import { ErrorState } from './ErrorState';

export type RequestStatusState = 'idle' | 'pending' | 'success' | 'error';

interface RequestStatusProps {
  state: RequestStatusState;
  error?: RoutePlanApiError | null;
  routeCount?: number;
}

/** Status area with reserved space (no layout shift) and live announcements. */
export function RequestStatus({
  state,
  error = null,
  routeCount = 0,
}: RequestStatusProps): React.JSX.Element {
  return (
    <Box aria-live="polite" sx={{ minHeight: 56, display: 'flex', alignItems: 'center' }}>
      {state === 'pending' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={24} aria-label="Loading" />
          <Typography>Creating your route plan…</Typography>
        </Box>
      )}
      {state === 'error' && error !== null && <ErrorState error={error} />}
      {state === 'success' && (
        <Alert severity="success" sx={{ width: '100%' }}>
          Route plan ready with {routeCount} alternative
          {routeCount === 1 ? '' : 's'}.
        </Alert>
      )}
    </Box>
  );
}
