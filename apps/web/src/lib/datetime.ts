/**
 * Convert a `datetime-local` input value to an explicit UTC ISO 8601 string.
 *
 * The browser control carries no timezone, so the input is interpreted in
 * the user's local timezone and converted to UTC. The result always ends
 * with `Z`, which is what the backend requires (naive timestamps are
 * rejected with 400).
 *
 * Daylight-saving behavior: a local wall time that does not exist (spring
 * forward gap) or that is ambiguous (fall back overlap) does not survive a
 * local round-trip. Gap times return `null`; ambiguous times resolve to the
 * first occurrence, matching `Date` semantics. Both are consequences of the
 * platform clock, not of this function.
 *
 * @returns UTC ISO string with `Z` suffix, or `null` when invalid.
 */
export function toUtcIso(localDateTime: string): string | null {
  const parts = parseLocalParts(localDateTime);
  if (parts === null) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  if (Number.isNaN(date.getTime())) return null;
  // Reject values that do not survive a local round-trip (overflow dates
  // such as Feb 30, and nonexistent DST gap times).
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day ||
    date.getHours() !== parts.hour ||
    date.getMinutes() !== parts.minute
  ) {
    return null;
  }
  return date.toISOString();
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Parse `YYYY-MM-DDTHH:mm` into validated numeric components. */
export function parseLocalParts(value: string): LocalParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const parts = match.slice(1).map(Number);
  if (parts.length !== 5 || parts.some((n) => !Number.isInteger(n))) return null;
  const [year, month, day, hour, minute] = parts as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

/**
 * Parse a `datetime-local` input value (`YYYY-MM-DDTHH:mm`) into a Date in
 * the user's local timezone, or null when invalid. Inverse of
 * `toLocalInputValue`; used to bridge the string form model with the
 * themed date/time picker, which works on Date objects.
 */
export function toLocalDate(value: string): Date | null {
  const parts = parseLocalParts(value);
  if (parts === null) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Format a Date as a `datetime-local` input value (`YYYY-MM-DDTHH:mm`)
 * in the user's local timezone, truncating seconds. Used for the
 * departure default ("today, now").
 */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}
