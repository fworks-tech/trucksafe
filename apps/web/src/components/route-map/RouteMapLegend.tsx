import ExpandMore from '@mui/icons-material/ExpandMore';
import TrendingDown from '@mui/icons-material/TrendingDown';
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material';
import { useState } from 'react';

import { RISK_LABELS } from '../../features/route-planning/risk';
import { riskColorFor, riskColors } from '../../features/route-planning/riskColors';
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

export interface MapLegendProps {
  /** Start collapsed (mobile default); the user can always expand. */
  defaultCollapsed?: boolean;
}

/** Floating legend decoding every map treatment as text; swatches are
 * decorative. Collapsible so it never obscures the map on small screens. */
export function RouteMapLegend({
  defaultCollapsed = false,
}: MapLegendProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  return (
    <Paper
      elevation={3}
      sx={{
        p: 1,
        maxWidth: 320,
        borderRadius: 2,
        bgcolor: 'rgba(255, 255, 255, 0.92)',
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <TrendingDown fontSize="small" aria-hidden="true" />
          <Typography variant="subtitle2" component="span">
            Map legend
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-expanded={expanded}
          aria-controls="map-legend-content"
          aria-label={expanded ? 'Collapse map legend' : 'Expand map legend'}
          onClick={() => setExpanded((open) => !open)}
        >
          <ExpandMore
            sx={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms',
            }}
          />
        </IconButton>
      </Box>
      {expanded && (
        <Box
          component="figure"
          id="map-legend-content"
          tabIndex={0}
          aria-label="Map legend details"
          sx={{ m: 0, maxHeight: '40vh', overflowY: 'auto', pr: 0.5 }}
        >
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
              color={riskColors.NO_TRAVEL}
              width={3}
              dashed
              label="No Travel route (dashed dark red, never safe)"
            />
            <Typography variant="body2" sx={{ pt: 1, fontWeight: 600 }}>
              Segment risk
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block' }}
            >
              Weather-grid circles use these colors; larger circles mean higher forecast
              risk.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {CHECKPOINT_RISKS.map((level) => (
                <Box
                  key={`segment-${level}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 24,
                      borderTop: `3px solid ${riskColorFor(level)}`,
                    }}
                  />
                  <Typography variant="body2">
                    {level === 'unavailable'
                      ? 'Segment: risk unavailable'
                      : `Segment: ${RISK_LABELS[level]} risk`}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, pt: 0.5 }}>
              {CHECKPOINT_RISKS.map((level) => (
                <DotSwatch
                  key={level}
                  color={riskColorFor(level)}
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
      )}
    </Paper>
  );
}
