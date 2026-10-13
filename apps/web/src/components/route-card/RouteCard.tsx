import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

import { statusTokens } from '../../app/theme';
import { formatDuration, formatMiles, formatScore } from '../../lib/format';
import { worstRiskLevel } from '../../features/route-planning/risk';
import type { RoutePayload } from '../../features/route-planning/types';
import { CheckpointList } from './CheckpointList';
import { EligibilityBadge } from './EligibilityBadge';
import { RiskBadge } from './RiskBadge';

interface RouteCardProps {
  route: RoutePayload;
  /** Human-facing name, e.g. "Route 2"; the backend id stays in data. */
  label: string;
  /** True only when the backend marks this eligible route recommended. */
  recommended: boolean;
  /** True when this route is the current map/list selection. */
  selected?: boolean;
  /** When provided, the card offers a selection control synced with the map. */
  onSelect?: (routeId: string) => void;
}

/** One route alternative. Ineligible routes are never shown as recommended. */
export function RouteCard({
  route,
  label,
  recommended,
  selected = false,
  onSelect,
}: RouteCardProps): React.JSX.Element {
  const showRecommended = recommended && route.is_eligible;
  const worst = worstRiskLevel(route.checkpoints);
  const token = statusTokens.recommended;

  return (
    <Card
      data-route-id={route.id}
      aria-label={`${label}${showRecommended ? ', recommended' : ''}${route.is_eligible ? '' : ', not eligible'}${selected ? ', selected' : ''}`}
      sx={
        showRecommended || selected
          ? {
              border: `2px solid ${token.border}`,
              ...(selected ? { boxShadow: `0 0 0 2px ${token.border}` } : null),
            }
          : undefined
      }
    >
      <CardContent>
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h3" component="h3">
              {label}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {showRecommended && (
              <Chip label="Recommended" color="primary" sx={{ fontWeight: 700 }} />
            )}
            <EligibilityBadge isEligible={route.is_eligible} />
            {selected && <Chip label="Selected" size="small" color="primary" />}
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
          {onSelect !== undefined && (
            <Box>
              <Button
                type="button"
                variant={selected ? 'contained' : 'outlined'}
                size="small"
                aria-pressed={selected}
                onClick={() => onSelect(route.id)}
              >
                {selected ? 'Selected on map' : 'Show on map'}
              </Button>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
