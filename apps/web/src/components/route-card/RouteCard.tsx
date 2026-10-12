import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

import { statusTokens } from '../../app/theme';
import { formatDuration, formatMiles, formatScore } from '../../lib/format';
import { worstRiskLevel } from '../../features/route-planning/risk';
import type { RoutePayload } from '../../features/route-planning/types';
import { CheckpointList } from './CheckpointList';
import { EligibilityBadge } from './EligibilityBadge';
import { RiskBadge } from './RiskBadge';

interface RouteCardProps {
  route: RoutePayload;
  /** True only when the backend marks this eligible route recommended. */
  recommended: boolean;
}

/** One route alternative. Ineligible routes are never shown as recommended. */
export function RouteCard({ route, recommended }: RouteCardProps): React.JSX.Element {
  const showRecommended = recommended && route.is_eligible;
  const worst = worstRiskLevel(route.checkpoints);
  const token = statusTokens.recommended;

  return (
    <Card
      aria-label={`Route ${route.id}${showRecommended ? ', recommended' : ''}${route.is_eligible ? '' : ', not eligible'}`}
      sx={showRecommended ? { border: `2px solid ${token.border}` } : undefined}
    >
      <CardContent>
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h3" component="h3">
              {route.id}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {showRecommended && (
              <Chip label="Recommended" color="primary" sx={{ fontWeight: 700 }} />
            )}
            <EligibilityBadge isEligible={route.is_eligible} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {formatDuration(route.duration_seconds)} · {formatMiles(route.distance_miles)}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <RiskBadge level={worst} />
            <Typography variant="caption" color="text.secondary">
              Highest checkpoint risk
            </Typography>
          </Box>
          <Typography variant="body2" component="div">
            Severe {formatMiles(route.severe_miles)} · High{' '}
            {formatMiles(route.high_miles)}
            {route.no_travel_miles > 0 &&
              ` · No Travel ${formatMiles(route.no_travel_miles)}`}
            {' · '}Avg risk {formatScore(route.average_risk_score)}
          </Typography>
          <CheckpointList checkpoints={route.checkpoints} routeId={route.id} />
        </Stack>
      </CardContent>
    </Card>
  );
}
