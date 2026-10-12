import { Chip } from '@mui/material';

import { riskTokens } from '../../app/theme';
import { RISK_LABELS } from '../../features/route-planning/risk';
import type { RiskLevel } from '../../features/route-planning/types';

type RiskTokenKey = keyof typeof riskTokens;

const RISK_TOKENS: Record<RiskLevel, RiskTokenKey> = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  SEVERE: 'severe',
  NO_TRAVEL: 'noTravel',
};

interface RiskBadgeProps {
  /** `null` renders an unavailable-risk badge (never a weather-safe one). */
  level: RiskLevel | null;
}

/** Colored risk badge that always carries a text label. */
export function RiskBadge({ level }: RiskBadgeProps): React.JSX.Element {
  if (level === null) {
    const token = riskTokens.unavailable;
    return (
      <Chip
        label="Risk unavailable"
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
  const token = riskTokens[RISK_TOKENS[level]];
  return (
    <Chip
      label={`Risk: ${RISK_LABELS[level]}`}
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
