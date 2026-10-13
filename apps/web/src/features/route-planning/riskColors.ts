/** Single source of truth for risk colors used by map layers and legends.

 * Values match the map style vocabulary: dark green through dark red, with
 * a neutral gray for unavailable weather. NO_TRAVEL and UNAVAILABLE are
 * distinct on purpose. Text labels always accompany color — never rely on
 * these values alone.
 */

import type { RiskLevel } from './types';

export const riskColors = {
  LOW: '#1b5e20',
  MODERATE: '#7a5c00',
  HIGH: '#8a3c00',
  SEVERE: '#a31226',
  NO_TRAVEL: '#5c0a14',
  UNAVAILABLE: '#78909c',
} as const satisfies Record<RiskLevel | 'UNAVAILABLE', string>;

export type RiskColorKey = keyof typeof riskColors;

/** Color for a checkpoint/segment/grid risk, `null` or unavailable-safe. */
export function riskColorFor(level: RiskLevel | 'unavailable' | null): string {
  if (level === null || level === 'unavailable') return riskColors.UNAVAILABLE;
  return riskColors[level];
}
