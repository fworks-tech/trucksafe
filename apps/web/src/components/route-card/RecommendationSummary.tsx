import { Alert, Box, Card, CardContent, Chip, Typography } from '@mui/material';

import { statusTokens } from '../../app/theme';
import { routeLabelsById } from '../../features/route-planning/labels';
import type { RoutePlanResponse } from '../../features/route-planning/types';
import { RequestIdNotice } from './RequestIdNotice';

interface RecommendationSummaryProps {
  response: RoutePlanResponse;
  requestId: string | null;
}

/** Recommendation status. Never selects a route when none is eligible. */
export function RecommendationSummary({
  response,
  requestId,
}: RecommendationSummaryProps): React.JSX.Element {
  const { recommended_route_id: recommendedId, recommendation_reason: reason } = response;
  const token = statusTokens.recommended;
  const labels = routeLabelsById(response.routes);

  if (recommendedId === null) {
    return (
      <Alert severity="warning" role="status">
        <Typography variant="subtitle1" component="p" fontWeight={700}>
          No eligible route available.
        </Typography>
        {reason !== null && <Typography variant="body2">{reason.message}</Typography>}
      </Alert>
    );
  }

  return (
    <Card
      sx={{
        border: `2px solid ${token.border}`,
        backgroundColor: token.background,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Chip
            label={`Recommended: ${recommendedId !== null ? (labels[recommendedId] ?? recommendedId) : ''}`}
            sx={{
              backgroundColor: token.background,
              color: token.text,
              border: `1px solid ${token.border}`,
              fontWeight: 700,
            }}
          />
        </Box>
        {reason !== null ? (
          <>
            <Typography variant="body2">{reason.message}</Typography>
            <Typography variant="caption" color="text.secondary">
              Criteria, in priority order: {reason.criteria.join(', ')}.
            </Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            The backend selected this route without an explanation.
          </Typography>
        )}
        <Box sx={{ mt: 1 }}>
          <RequestIdNotice requestId={requestId} />
        </Box>
      </CardContent>
    </Card>
  );
}
