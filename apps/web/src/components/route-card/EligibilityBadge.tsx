import { Chip } from '@mui/material';

import { statusTokens } from '../../app/theme';

interface EligibilityBadgeProps {
  isEligible: boolean;
}

/** Explicit eligibility text; ineligible routes are never shown as safe. */
export function EligibilityBadge({
  isEligible,
}: EligibilityBadgeProps): React.JSX.Element {
  const token = isEligible ? statusTokens.eligible : statusTokens.ineligible;
  return (
    <Chip
      label={isEligible ? 'Eligible' : 'Not eligible'}
      size="small"
      sx={{
        backgroundColor: token.background,
        color: token.text,
        border: `1px solid ${token.border}`,
        fontWeight: 700,
      }}
    />
  );
}
