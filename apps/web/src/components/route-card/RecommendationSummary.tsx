import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';

import { statusTokens } from '../../app/theme';
import { formatScore } from '../../lib/format';
import { routeLabelsById } from '../../features/route-planning/labels';
import type { RoutePlanResponse } from '../../features/route-planning/types';

interface RecommendationSummaryProps {
  response: RoutePlanResponse;
  requestId: string | null;
}

/**
 * Recommendation status. The primary message is plain user language;
 * raw ranking criteria stay behind a "Technical details" disclosure so
 * they never dominate the card. Never selects a route when none is
 * eligible.
 */
export function RecommendationSummary({
  response,
  requestId,
}: RecommendationSummaryProps): React.JSX.Element | null {
  const { recommended_route_id: recommendedId, recommendation_reason: reason } = response;
  const token = statusTokens.recommended;
  const labels = routeLabelsById(response.routes);
  // Dismissible to cut sidebar noise; fresh mount per plan resets it.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (recommendedId === null) {
    return (
      <Alert severity="warning" role="status" onClose={() => setDismissed(true)}>
        <Typography variant="subtitle1" component="p" fontWeight={700}>
          No eligible route available.
        </Typography>
        {reason !== null && <Typography variant="body2">{reason.message}</Typography>}
      </Alert>
    );
  }

  return (
    <Card
      data-tour="recommended-route"
      sx={{
        border: `2px solid ${token.border}`,
        backgroundColor: token.background,
      }}
    >
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Chip
            label={`Recommended: ${labels[recommendedId] ?? recommendedId}`}
            sx={{
              backgroundColor: token.background,
              color: token.text,
              border: `1px solid ${token.border}`,
              fontWeight: 700,
            }}
          />
          <IconButton
            type="button"
            size="small"
            aria-label="Dismiss recommendation"
            onClick={() => setDismissed(true)}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="body2">
          Recommended because it has the lowest overall weather risk and travel time.
        </Typography>
        <Accordion disableGutters sx={{ mt: 1, boxShadow: 'none' }}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="recommendation-technical-details"
            id="recommendation-technical-header"
          >
            <Typography variant="caption" color="text.secondary">
              Technical details
            </Typography>
          </AccordionSummary>
          <AccordionDetails id="recommendation-technical-details">
            {reason !== null ? (
              <>
                <Typography variant="body2">{reason.message}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Criteria, in priority order: {reason.criteria.join(', ')}.
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  Ranking values:{' '}
                  {reason.ranking_key.map((value) => formatScore(value)).join(' · ')}.
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                The backend selected this route without an explanation.
              </Typography>
            )}
            <Box sx={{ mt: 1 }}>
              {requestId !== null && requestId !== '' && (
                <Typography
                  component="code"
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.5,
                    p: 1,
                    backgroundColor: 'background.default',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    wordBreak: 'break-all',
                  }}
                >
                  Request ID: {requestId}
                </Typography>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>
      </CardContent>
    </Card>
  );
}
