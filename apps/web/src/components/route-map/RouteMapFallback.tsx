import { Alert, Box, Button, Typography } from '@mui/material';

export type MapFallbackReason = 'no-geometry' | 'map-unavailable';

interface RouteMapFallbackProps {
  reason: MapFallbackReason;
  /** Retry is only offered when retry can help (map load failure). */
  onRetry?: () => void;
}

/** Accessible map fallback. The textual route comparison always stays. */
export function RouteMapFallback({
  reason,
  onRetry,
}: RouteMapFallbackProps): React.JSX.Element {
  return (
    <Alert
      severity="info"
      role="status"
      action={
        reason === 'map-unavailable' && onRetry !== undefined ? (
          <Button type="button" color="inherit" size="small" onClick={onRetry}>
            Retry map
          </Button>
        ) : undefined
      }
    >
      <Box>
        <Typography variant="subtitle2" component="p" gutterBottom>
          {reason === 'no-geometry'
            ? 'Map unavailable for this result'
            : 'The interactive map could not be loaded'}
        </Typography>
        <Typography variant="body2" component="p">
          {reason === 'no-geometry'
            ? 'None of the routes included usable map geometry. The route cards and checkpoint details below still describe every alternative.'
            : 'The route cards and checkpoint details below still describe every alternative. Check your connection or map configuration and retry.'}
        </Typography>
      </Box>
    </Alert>
  );
}
