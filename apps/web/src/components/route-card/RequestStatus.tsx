import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { useState } from 'react';

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
  // Dismissible so the success note stops competing with the routes.
  // Fresh mount per plan (response clears on submit), so no reset logic.
  const [successDismissed, setSuccessDismissed] = useState(false);
  return !successDismissed ? (
    <Box aria-live="polite" sx={{ minHeight: 56, display: 'flex', alignItems: 'center' }}>
      {state === 'pending' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={24} aria-label="Loading" />
          <Typography>Creating your route plan…</Typography>
        </Box>
      )}
      {state === 'error' && error !== null && <ErrorState error={error} />}
      {state === 'success' && !successDismissed && (
        <Alert
          severity="success"
          onClose={() => setSuccessDismissed(true)}
          sx={{ width: '100%' }}
        >
          Route plan ready with {routeCount} alternative
          {routeCount === 1 ? '' : 's'}.
        </Alert>
      )}
    </Box>
  ) : (
    <></>
  );
}
