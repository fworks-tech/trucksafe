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
import type { CheckpointPayload } from '../../features/route-planning/types';
import { RiskBadge } from './RiskBadge';
import { WeatherStatus } from './WeatherStatus';

interface CheckpointListProps {
  checkpoints: CheckpointPayload[];
  routeId: string;
  /** Currently map-selected checkpoint, for `aria-current`. */
  selectedCheckpointId?: string | null;
  /** When provided, each row focuses its checkpoint on the map. */
  onSelectCheckpoint?: (checkpointId: string) => void;
}

function roleOf(index: number, total: number): 'origin' | 'destination' | null {
  if (index === 0) return 'origin';
  if (index === total - 1) return 'destination';
  return null;
}

/** Ordered checkpoint details; safe fallbacks for every optional field. */
export function CheckpointList({
  checkpoints,
  routeId,
  selectedCheckpointId = null,
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
        <List disablePadding aria-label={`Checkpoints for ${routeId}`}>
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
                {checkpoint.risk_reasons.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Why: {checkpoint.risk_reasons.join('; ')}
                  </Typography>
                )}
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
            const selected = checkpoint.checkpoint_id === selectedCheckpointId;
            return (
              <ListItem
                key={checkpoint.checkpoint_id}
                divider={index < checkpoints.length - 1}
                disablePadding
              >
                <ListItemButton
                  selected={selected}
                  aria-current={selected || undefined}
                  onClick={() => onSelectCheckpoint(checkpoint.checkpoint_id)}
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
