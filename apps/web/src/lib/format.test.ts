import { describe, expect, it } from 'vitest';

import { formatDuration, formatEta, formatMiles, formatScore } from './format';

describe('formatEta', () => {
  it('renders UTC timestamps with an explicit UTC marker', () => {
    expect(formatEta('2026-10-12T14:00:00Z')).toBe('12 Oct 2026, 14:00 UTC');
  });

  it('normalizes offsets to UTC instead of showing them raw', () => {
    expect(formatEta('2026-10-12T16:00:00+02:00')).toBe('12 Oct 2026, 14:00 UTC');
  });

  it('renders stable output across a daylight-saving boundary', () => {
    // US DST springs forward on 2026-03-08 at 07:00 UTC.
    expect(formatEta('2026-03-08T06:59:00Z')).toBe('8 Mar 2026, 06:59 UTC');
    expect(formatEta('2026-03-08T07:01:00Z')).toBe('8 Mar 2026, 07:01 UTC');
  });

  it('falls back for invalid timestamps', () => {
    expect(formatEta('not-a-date')).toBe('Not available');
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(59520)).toBe('16h 32m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(2700)).toBe('45m');
    expect(formatDuration(50)).toBe('50s');
  });

  it('falls back for invalid input', () => {
    expect(formatDuration(Number.NaN)).toBe('Not available');
    expect(formatDuration(-5)).toBe('Not available');
  });
});

describe('formatMiles', () => {
  it('formats with one decimal', () => {
    expect(formatMiles(912.44)).toBe('912.4 mi');
    expect(formatMiles(0)).toBe('0.0 mi');
  });

  it('falls back for invalid input', () => {
    expect(formatMiles(Number.POSITIVE_INFINITY)).toBe('Not available');
  });
});

describe('formatScore', () => {
  it('formats with one decimal and falls back safely', () => {
    expect(formatScore(2.5)).toBe('2.5');
    expect(formatScore(Number.NaN)).toBe('Not available');
  });
});
