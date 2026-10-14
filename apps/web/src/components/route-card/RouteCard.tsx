import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

import { statusTokens } from '../../app/theme';
import { formatDuration, formatMiles, formatScore } from '../../lib/format';
import { worstRiskLevel } from '../../features/route-planning/risk';
import type { CheckpointSelection } from '../../features/route-map/geo';
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
  /** True when this route is hidden from the map (the card stays). */
  hidden?: boolean;
  /** When provided, the card offers a map visibility toggle. */
  onToggleVisibility?: (routeId: string) => void;
  /** Currently map-selected checkpoint, for the checkpoint list. */
  selectedCheckpoint?: CheckpointSelection | null;
  /** When provided, checkpoint rows focus the map. */
  onSelectCheckpoint?: (selection: CheckpointSelection) => void;
}

/** One route alternative. Ineligible routes are never shown as recommended.
 *
 * The whole card selects on pointer input (inner controls keep their own
 * behavior); keyboard users get the same action from the select button.
 * Badges stay minimal: Recommended when applicable, Not eligible when the
 * route cannot be used, and Selected only when the selection differs from
 * the recommendation and needs clarification.
 */
export function RouteCard({
  route,
  label,
  recommended,
  selected = false,
  onSelect,
  hidden = false,
  onToggleVisibility,
  selectedCheckpoint = null,
  onSelectCheckpoint,
}: RouteCardProps): React.JSX.Element {
  const showRecommended = recommended && route.is_eligible;
  // The Selected chip only clarifies a choice that differs from the
  // recommendation; the recommended-and-selected card already says both
  // through its chip, outline, and button state.
  const showSelected = selected && !showRecommended;
  const worst = worstRiskLevel(route.checkpoints);
  const token = statusTokens.recommended;

  return (
    <Card
      data-route-id={route.id}
      aria-label={`${label}${showRecommended ? ', recommended' : ''}${route.is_eligible ? '' : ', not eligible'}${selected ? ', selected' : ''}`}
      onClick={(event) => {
        if (onSelect === undefined) return;
        // Pointer convenience only: taps on inner controls (checkpoint
        // accordion, select button) keep their own behavior.
        if (
          (event.target as HTMLElement).closest(
            'button, a, input, select, textarea, [role="button"]',
          ) !== null
        ) {
          return;
        }
        onSelect(route.id);
      }}
      sx={
        showRecommended || selected
          ? {
              border: `2px solid ${token.border}`,
              ...(selected ? { boxShadow: `0 0 0 2px ${token.border}` } : null),
              ...(onSelect !== undefined ? { cursor: 'pointer' } : null),
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
            {!route.is_eligible && <EligibilityBadge isEligible={false} />}
            {showSelected && <Chip label="Selected" size="small" color="primary" />}
            {hidden && <Chip label="Hidden from map" size="small" variant="outlined" />}
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
            {' · '}Avg risk {formatScore(route.average_risk_score)} of 5
          </Typography>
          <CheckpointList
            checkpoints={route.checkpoints}
            routeId={route.id}
            selectedCheckpoint={selectedCheckpoint}
            onSelectCheckpoint={onSelectCheckpoint}
          />
          {(onSelect !== undefined || onToggleVisibility !== undefined) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {onSelect !== undefined && (
                <Button
                  type="button"
                  variant={selected ? 'contained' : 'outlined'}
                  size="small"
                  aria-pressed={selected}
                  onClick={() => onSelect(route.id)}
                >
                  {selected ? 'Selected on map' : 'Show on map'}
                </Button>
              )}
              {onToggleVisibility !== undefined && (
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  aria-pressed={!hidden}
                  onClick={() => onToggleVisibility(route.id)}
                >
                  {hidden ? 'Show route' : 'Hide route'}
                </Button>
              )}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
