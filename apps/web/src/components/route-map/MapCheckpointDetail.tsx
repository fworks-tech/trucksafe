import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';

import { formatEta, formatMiles } from '../../lib/format';
import type { CheckpointRole } from '../../features/route-map/geo';
import type { CheckpointPayload } from '../../features/route-planning/types';
import { RiskBadge } from '../route-card/RiskBadge';
import { RiskReasons } from '../route-card/RiskReasons';
import { WeatherStatus } from '../route-card/WeatherStatus';

interface MapCheckpointDetailProps {
  checkpoint: CheckpointPayload;
  role: CheckpointRole;
  /** Human route name ("Route 3"); the heading must name it. */
  routeLabel?: string;
  onClose: () => void;
}

/** Details for the checkpoint picked on the map.
 *
 * The same data lives in the route card checkpoint lists; this panel
 * mirrors the map pick in the DOM so pointer selection stays inspectable
 * by keyboard and screen-reader users.
 */
export function MapCheckpointDetail({
  checkpoint,
  role,
  routeLabel,
  onClose,
}: MapCheckpointDetailProps): React.JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const heading =
    routeLabel === undefined
      ? `Checkpoint ${checkpoint.sequence} of route`
      : `Checkpoint ${checkpoint.sequence} of ${routeLabel}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Box
      component="section"
      aria-label={`${heading} details`}
      sx={{ border: '1px solid #cfd8dc', borderRadius: 2, p: 2 }}
    >
      <Stack spacing={1}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography
            ref={headingRef}
            variant="subtitle2"
            component="h3"
            tabIndex={-1}
            sx={{ '&:focus': { outline: 'none' } }}
          >
            {heading}
          </Typography>
          {role !== 'via' && (
            <Chip
              label={role === 'origin' ? 'Origin' : 'Destination'}
              size="small"
              color="primary"
            />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {formatMiles(checkpoint.distance_miles)} from origin · ETA{' '}
          {formatEta(checkpoint.eta)}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {checkpoint.weather_available ? (
            <RiskBadge level={checkpoint.risk_level} />
          ) : (
            <WeatherStatus available={false} />
          )}
        </Box>
        <RiskReasons reasons={checkpoint.risk_reasons} />
        <Box>
          <Button type="button" variant="outlined" size="small" onClick={onClose}>
            Close checkpoint details
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
