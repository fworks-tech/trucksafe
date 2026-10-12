import { Box, Stack, Typography } from '@mui/material';

import { riskTokens } from '../../app/theme';
import { RISK_LABELS } from '../../features/route-planning/risk';
import type { RiskLevel } from '../../features/route-planning/types';

function LineSwatch({
  color,
  width,
  dashed,
  label,
}: {
  color: string;
  width: number;
  dashed: boolean;
  label: string;
}): React.JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 36,
          borderTop: `${width}px ${dashed ? 'dashed' : 'solid'} ${color}`,
          opacity: 0.9,
        }}
      />
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
}

function DotSwatch({
  color,
  label,
}: {
  color: string;
  label: string;
}): React.JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: color,
          border: '2px solid #ffffff',
          outline: '1px solid #78909c',
        }}
      />
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
}

const CHECKPOINT_RISKS: readonly (RiskLevel | 'unavailable')[] = [
  'LOW',
  'MODERATE',
  'HIGH',
  'SEVERE',
  'NO_TRAVEL',
  'unavailable',
];

function checkpointColor(level: RiskLevel | 'unavailable'): string {
  if (level === 'unavailable') return '#78909c';
  switch (level) {
    case 'LOW':
      return '#1b5e20';
    case 'MODERATE':
      return '#7a5c00';
    case 'HIGH':
      return '#8a3c00';
    case 'SEVERE':
      return '#a31226';
    case 'NO_TRAVEL':
      return '#5c0a14';
  }
}

/** Text legend decoding every map treatment; swatches are decorative. */
export function RouteMapLegend(): React.JSX.Element {
  return (
    <Box component="figure" sx={{ m: 0 }}>
      <Typography component="figcaption" variant="subtitle2" gutterBottom>
        Map legend
      </Typography>
      <Stack spacing={0.5}>
        <LineSwatch
          color="#0d47a1"
          width={5}
          dashed={false}
          label="Recommended route (wider, solid blue)"
        />
        <LineSwatch
          color="#0d47a1"
          width={3}
          dashed={false}
          label="Selected route (highlighted)"
        />
        <LineSwatch
          color="#455a64"
          width={3}
          dashed={false}
          label="Other eligible route"
        />
        <LineSwatch
          color="#9e9e9e"
          width={3}
          dashed
          label="Ineligible route (dashed gray)"
        />
        <LineSwatch
          color={riskTokens.noTravel.background}
          width={3}
          dashed
          label="No Travel route (dashed dark red, never safe)"
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, pt: 0.5 }}>
          {CHECKPOINT_RISKS.map((level) => (
            <DotSwatch
              key={level}
              color={checkpointColor(level)}
              label={
                level === 'unavailable'
                  ? 'Checkpoint: weather unavailable'
                  : `Checkpoint: ${RISK_LABELS[level]} risk`
              }
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
