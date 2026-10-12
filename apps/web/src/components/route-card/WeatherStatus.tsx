import { Chip } from '@mui/material';

import { riskTokens } from '../../app/theme';

interface WeatherStatusProps {
  available: boolean;
}

/**
 * Weather availability indicator. Unavailable weather is always shown as
 * "Weather unavailable" (gray) and is never rendered as a risk level.
 */
export function WeatherStatus({
  available,
}: WeatherStatusProps): React.JSX.Element | null {
  if (available) return null;
  const token = riskTokens.unavailable;
  return (
    <Chip
      label="Weather unavailable"
      size="small"
      sx={{
        backgroundColor: token.background,
        color: token.text,
        border: `1px solid ${token.border}`,
        fontWeight: 600,
      }}
    />
  );
}
