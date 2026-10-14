/** Plain-text content for map detail popups.
 *
 * Popups are the only map text not mirrored in the DOM, so their content
 * is built here from typed payloads (never raw provider fields) and the
 * adapter only renders the resulting string via `setText`.
 */

import { RISK_LABELS } from '../route-planning/risk';
import type { CheckpointPayload } from '../route-planning/types';
import { formatEta, formatMiles } from '../../lib/format';
import type { MappableWeatherCell } from './geo';

/** Checkpoint pick: identity, risk, distance, ETA, and the why.
 *
 * One fact per line: a single `·`-joined sentence does not scan in a
 * small popup. The adapter renders this with `white-space: pre-line`.
 */
export function checkpointPopupText(
  checkpoint: CheckpointPayload,
  routeLabel?: string,
): string {
  const risk =
    checkpoint.weather_available && checkpoint.risk_level !== null
      ? `${RISK_LABELS[checkpoint.risk_level]} risk`
      : 'Weather unavailable';
  const lines = [
    routeLabel === undefined
      ? `Checkpoint ${checkpoint.sequence}`
      : `${routeLabel} · Checkpoint ${checkpoint.sequence}`,
    `${risk} · ${formatMiles(checkpoint.distance_miles)} from origin`,
    `ETA ${formatEta(checkpoint.eta)}`,
  ];
  if (checkpoint.risk_reasons.length > 0) {
    lines.push(checkpoint.risk_reasons.join('; '));
  }
  return lines.join('\n');
}

/** Forecast cell pick: risk plus the observed measures behind it. */
export function heatCellPopupText(cell: MappableWeatherCell): string {
  const risk =
    cell.risk === 'unavailable'
      ? 'Weather unavailable'
      : `${RISK_LABELS[cell.risk]} risk`;
  const lines = ['Forecast', risk];
  // Reasons already carry observed values; raw measures only fill the
  // gap when the backend sent none.
  if (cell.riskReasons.length > 0) {
    lines.push(cell.riskReasons.join('; '));
    return lines.join('\n');
  }
  if (cell.windMph !== null) lines.push(`Wind ${cell.windMph} mph`);
  if (cell.rainInchesPerHour !== null) lines.push(`Rain ${cell.rainInchesPerHour} in/h`);
  if (cell.snowInchesPerHour !== null) lines.push(`Snow ${cell.snowInchesPerHour} in/h`);
  return lines.join('\n');
}
