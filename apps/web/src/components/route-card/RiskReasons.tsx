import { Box, Typography } from '@mui/material';

interface RiskReasonsProps {
  reasons: readonly string[];
}

/** One reason per line: a `;`-joined sentence does not scan. */
export function RiskReasons({ reasons }: RiskReasonsProps): React.JSX.Element | null {
  if (reasons.length === 0) return null;
  return (
    <Box component="div">
      <Typography variant="caption" color="text.secondary" component="div">
        Why this risk:
      </Typography>
      <Box
        component="ul"
        sx={{ m: 0, pl: 2, typography: 'caption', color: 'text.secondary' }}
      >
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </Box>
    </Box>
  );
}
