import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { formatEta, formatMiles } from '../../lib/format';
import type { CheckpointSelection } from '../../features/route-map/geo';
import type { CheckpointPayload } from '../../features/route-planning/types';
import { RiskBadge } from './RiskBadge';
import { RiskReasons } from './RiskReasons';
import { WeatherStatus } from './WeatherStatus';

interface CheckpointListProps {
  checkpoints: CheckpointPayload[];
  routeId: string;
  /** Currently map-selected checkpoint, for `aria-current`. */
  selectedCheckpoint?: CheckpointSelection | null;
  /** When provided, each row focuses its checkpoint on the map. */
  onSelectCheckpoint?: (selection: CheckpointSelection) => void;
}

function roleOf(index: number, total: number): 'origin' | 'destination' | null {
  if (index === 0) return 'origin';
  if (index === total - 1) return 'destination';
  return null;
}

/** Expanded list height cap (px): a long checkpoint list scrolls inside
 * instead of stretching its card and the carousel track around it. */
const CHECKPOINT_LIST_MAX_HEIGHT = 320;

/** Ordered checkpoint details; safe fallbacks for every optional field. */
export function CheckpointList({
  checkpoints,
  routeId,
  selectedCheckpoint = null,
  onSelectCheckpoint,
}: CheckpointListProps): React.JSX.Element {
  if (checkpoints.length === 0) {
    return <Typography color="text.secondary">No checkpoints reported.</Typography>;
  }
  return (
    <Accordion disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>Checkpoints ({checkpoints.length})</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {/* Capped so a 40-checkpoint plan cannot stretch its card (and
            the whole carousel track) to thousands of pixels; the list
            scrolls inside instead. */}
        <List
          disablePadding
          aria-label={`Checkpoints for ${routeId}`}
          sx={{ overflowY: 'auto', maxHeight: CHECKPOINT_LIST_MAX_HEIGHT }}
        >
          {checkpoints.map((checkpoint, index) => {
            const role = roleOf(index, checkpoints.length);
            const content = (
              <Stack spacing={0.5} sx={{ width: '100%' }}>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="subtitle2" component="span">
                    {index + 1}. {formatMiles(checkpoint.distance_miles)}
                  </Typography>
                  {role === 'origin' && (
                    <Chip label="Origin" size="small" color="primary" />
                  )}
                  {role === 'destination' && (
                    <Chip label="Destination" size="small" color="primary" />
                  )}
                </Box>
                <ListItemText
                  secondary={`ETA ${formatEta(checkpoint.eta)}`}
                  sx={{ m: 0 }}
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {checkpoint.weather_available ? (
                    <RiskBadge level={checkpoint.risk_level} />
                  ) : (
                    <WeatherStatus available={false} />
                  )}
                </Box>
                <RiskReasons reasons={checkpoint.risk_reasons} />
              </Stack>
            );
            // Rows steer the map when a handler exists; otherwise they
            // stay static text (list-only contexts).
            if (onSelectCheckpoint === undefined) {
              return (
                <ListItem
                  key={checkpoint.checkpoint_id}
                  divider={index < checkpoints.length - 1}
                  sx={{ px: 0 }}
                >
                  {content}
                </ListItem>
              );
            }
            // The pick is route-qualified: checkpoint ids repeat
            // across routes, so a bare id would highlight every
            // same-sequence row.
            const selected =
              selectedCheckpoint?.routeId === routeId &&
              selectedCheckpoint?.checkpointId === checkpoint.checkpoint_id;
            return (
              <ListItem
                key={checkpoint.checkpoint_id}
                divider={index < checkpoints.length - 1}
                disablePadding
              >
                <ListItemButton
                  selected={selected}
                  aria-current={selected || undefined}
                  onClick={() =>
                    onSelectCheckpoint({
                      routeId,
                      checkpointId: checkpoint.checkpoint_id,
                    })
                  }
                  sx={{ px: 0 }}
                >
                  {content}
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </AccordionDetails>
    </Accordion>
  );
}
