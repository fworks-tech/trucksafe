/** Pure forecast-time helpers for the 0-48h slider. */

import { format, parseISO } from 'date-fns';

/** Compute the absolute UTC forecast timestamp from departure + offset. */
export function computeForecastTime(departureAt: string, offsetHours: number): string {
  try {
    const departure = parseISO(departureAt.replace('Z', '+00:00'));
    const forecast = new Date(departure.getTime() + offsetHours * 3600 * 1000);
    return forecast.toISOString().replace(/\.\d{3}Z$/, 'Z');
  } catch {
    return departureAt;
  }
}

/** Format a UTC timestamp as `MMM d, yyyy HH:mm UTC`. */
export function formatForecastTime(utcString: string): string {
  try {
    const date = parseISO(utcString.replace('Z', '+00:00'));
    return format(date, 'MMM d, yyyy HH:mm') + ' UTC';
  } catch {
    return utcString;
  }
}

/** Relative label for an offset: 'Departure time' or '+12h'. */
export function forecastOffsetLabel(offsetHours: number): string {
  return offsetHours === 0 ? 'Departure time' : `+${offsetHours}h`;
}
