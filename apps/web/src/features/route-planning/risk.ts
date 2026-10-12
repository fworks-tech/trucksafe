import type { CheckpointPayload, RiskLevel } from './types';

/** Severity order; the highest present level wins (backend precedence). */
const SEVERITY_ORDER: readonly RiskLevel[] = [
  'LOW',
  'MODERATE',
  'HIGH',
  'SEVERE',
  'NO_TRAVEL',
];

/** Visible text for every risk level; color is never the only signal. */
export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  SEVERE: 'Severe',
  NO_TRAVEL: 'No Travel',
};

/** Worst risk level across checkpoints, or `null` when none is reported. */
export function worstRiskLevel(
  checkpoints: readonly CheckpointPayload[],
): RiskLevel | null {
  let worst: RiskLevel | null = null;
  for (const checkpoint of checkpoints) {
    const level = checkpoint.risk_level;
    if (level === null) continue;
    if (worst === null || SEVERITY_ORDER.indexOf(level) > SEVERITY_ORDER.indexOf(worst)) {
      worst = level;
    }
  }
  return worst;
}
