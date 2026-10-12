/** Display formatting. All timestamps shown are UTC; every rendered time
 * carries an explicit `UTC` marker so UTC is never silently shown as local.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** Format a UTC ISO timestamp as `12 Oct 2026, 14:00 UTC`, or a fallback. */
export function formatEta(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return (
    `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}, ` +
    `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())} UTC`
  );
}

/** Format seconds as `16h 12m`, `45m`, or `50s`. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'Not available';
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds % 60}s`;
}

/** Format miles with one decimal, e.g. `912.4 mi`. */
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return 'Not available';
  return `${miles.toFixed(1)} mi`;
}

/** Format a risk score with one decimal, e.g. `2.5`. */
export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return 'Not available';
  return score.toFixed(1);
}
