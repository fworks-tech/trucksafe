import {
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';

import { formatDuration, formatMiles } from '../../lib/format';
import { RISK_LABELS } from '../../features/route-planning/risk';
import { worstRiskLevel } from '../../features/route-planning/risk';
import type { RouteVisualState } from '../../features/route-map/geo';
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

function optionLabel(route: RoutePayload, state: RouteVisualState): string {
  const worst = worstRiskLevel(route.checkpoints);
  const risk = worst === null ? 'risk unavailable' : `${RISK_LABELS[worst]} risk`;
  return (
    `Route ${route.id}: ${STATE_TEXT[state]}. ` +
    `${risk}. ${formatDuration(route.duration_seconds)}, ` +
    `${formatMiles(route.distance_miles)}.`
  );
}

/** Keyboard- and screen-reader-accessible route selection.
 *
 * This list is the primary selection control: it works identically with
 * or without the visual map, so the canvas is never the only channel.
 */
export function MapRouteSelection({
  entries,
  selectedRouteId,
  onSelectRoute,
}: MapRouteSelectionProps): React.JSX.Element {
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
        {entries.map(({ route, state }) => (
          <FormControlLabel
            key={route.id}
            value={route.id}
            control={<Radio />}
            label={optionLabel(route, state)}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
