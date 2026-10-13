import {
  Box,
  Chip,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';

import { formatDuration, formatMiles } from '../../lib/format';
import { RISK_LABELS, worstRiskLevel } from '../../features/route-planning/risk';
import { routeLabelsById } from '../../features/route-planning/labels';
import type { RouteVisualState } from '../../features/route-map/geo';
import { riskColorFor } from '../../features/route-planning/riskColors';
import type { RoutePayload } from '../../features/route-planning/types';

export interface RouteSelectionEntry {
  route: RoutePayload;
  state: RouteVisualState;
}

interface MapRouteSelectionProps {
  entries: RouteSelectionEntry[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

const STATE_TEXT: Record<RouteVisualState, string> = {
  'recommended-selected': 'Recommended, selected on map',
  recommended: 'Recommended',
  selected: 'Selected on map',
  eligible: 'Alternative',
  ineligible: 'Not eligible',
  'no-travel': 'No Travel: do not use',
  'no-geometry': 'No map geometry (list only)',
};

/** Structured row: name and status up top, stats below. The radio's
 * accessible name is the full sentence, so screen-reader users get the
 * same complete information as sighted ones. */
export function MapRouteSelection({
  entries,
  selectedRouteId,
  onSelectRoute,
}: MapRouteSelectionProps): React.JSX.Element {
  const labels = routeLabelsById(entries.map((entry) => entry.route));
  return (
    <FormControl component="fieldset">
      <Typography component="legend" variant="subtitle2" gutterBottom>
        Select a route to inspect
      </Typography>
      <RadioGroup
        aria-label="Route alternatives"
        value={selectedRouteId ?? ''}
        onChange={(event) => onSelectRoute(event.target.value)}
      >
        {entries.map(({ route, state }) => {
          const label = labels[route.id] ?? route.id;
          const worst = worstRiskLevel(route.checkpoints);
          const riskText =
            worst === null ? 'Risk unavailable' : `${RISK_LABELS[worst]} risk`;
          return (
            <FormControlLabel
              key={route.id}
              value={route.id}
              control={<Radio />}
              sx={{
                alignItems: 'flex-start',
                mr: 0,
                py: 0.5,
                px: 1,
                borderRadius: 2,
                ...(selectedRouteId === route.id
                  ? {
                      bgcolor: 'action.selected',
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                    }
                  : null),
                '& .MuiFormControlLabel-label': { width: '100%' },
              }}
              label={
                <Stack spacing={0.5} width="100%">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                    }}
                  >
                    <Typography variant="subtitle2" component="span" fontWeight={700}>
                      {label}
                    </Typography>
                    {(state === 'recommended' || state === 'recommended-selected') && (
                      <Chip
                        label="Recommended"
                        size="small"
                        color="primary"
                        sx={{ fontWeight: 700 }}
                      />
                    )}
                  </Box>
                  <Typography variant="body2">{STATE_TEXT[state]}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {`${formatDuration(route.duration_seconds)} · ${formatMiles(route.distance_miles)}`}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: worst === null ? 'text.disabled' : riskColorFor(worst),
                      }}
                    />
                    <Typography variant="caption">{riskText}</Typography>
                  </Box>
                </Stack>
              }
            />
          );
        })}
      </RadioGroup>
    </FormControl>
  );
}
