import { Alert, Stack } from '@mui/material';

import type { RoutePlanApiError } from '../../features/route-planning/api/errors';
import { RequestIdNotice } from './RequestIdNotice';

interface ErrorStateProps {
  error: RoutePlanApiError;
}

/**
 * Safe error display: the fixed category message is primary; backend
 * envelope details appear only inside collapsed diagnostics.
 */
export function ErrorState({ error }: ErrorStateProps): React.JSX.Element {
  const hasBackendDetails = error.backendCode !== null || error.backendMessage !== null;
  return (
    <Stack spacing={1} role="alert">
      <Alert severity="error">{error.message}</Alert>
      <RequestIdNotice requestId={error.requestId} />
      {hasBackendDetails && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.8rem' }}>
            Backend response
          </summary>
          <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
            {error.backendCode !== null && `code: ${error.backendCode}\n`}
            {error.backendMessage !== null && `message: ${error.backendMessage}`}
          </pre>
        </details>
      )}
    </Stack>
  );
}
