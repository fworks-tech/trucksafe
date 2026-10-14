import { describe, expect, it } from 'vitest';

import { parseLocalParts, toLocalDate, toLocalInputValue, toUtcIso } from './datetime';

describe('parseLocalParts', () => {
  it('parses a well-formed datetime-local value', () => {
    expect(parseLocalParts('2026-10-12T14:30')).toEqual({
      year: 2026,
      month: 10,
      day: 12,
      hour: 14,
      minute: 30,
    });
  });

  it('rejects values outside the datetime-local shape', () => {
    expect(parseLocalParts('2026-10-12')).toBeNull();
    expect(parseLocalParts('2026-10-12T14:30:00')).toBeNull();
    expect(parseLocalParts('2026-10-12T14:30:00Z')).toBeNull();
    expect(parseLocalParts('tomorrow at noon')).toBeNull();
    expect(parseLocalParts('')).toBeNull();
  });

  it('rejects out-of-range components', () => {
    expect(parseLocalParts('2026-13-12T14:30')).toBeNull();
    expect(parseLocalParts('2026-00-12T14:30')).toBeNull();
    expect(parseLocalParts('2026-10-32T14:30')).toBeNull();
    expect(parseLocalParts('2026-10-12T24:30')).toBeNull();
    expect(parseLocalParts('2026-10-12T14:60')).toBeNull();
  });
});

describe('toUtcIso', () => {
  it('serializes local input as an explicit UTC ISO 8601 timestamp', () => {
    const out = toUtcIso('2026-10-12T14:30');
    expect(out).not.toBeNull();
    expect(out ?? '').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('represents the same instant as the local wall time', () => {
    const out = toUtcIso('2026-01-15T08:05');
    expect(out).not.toBeNull();
    const back = new Date(out ?? '');
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(0);
    expect(back.getDate()).toBe(15);
    expect(back.getHours()).toBe(8);
    expect(back.getMinutes()).toBe(5);
  });

  it('rejects invalid and overflow dates', () => {
    expect(toUtcIso('')).toBeNull();
    expect(toUtcIso('not-a-date')).toBeNull();
    // 30 Feb overflows into March and fails the round-trip check.
    expect(toUtcIso('2026-02-30T10:00')).toBeNull();
    // Month 13 overflows into the next year.
    expect(toUtcIso('2026-13-01T10:00')).toBeNull();
  });

  it('never crashes on a spring-forward gap candidate', () => {
    // 2026-03-08T02:30 does not exist in zones that spring forward that
    // day. The documented contract: gap times are rejected (null), valid
    // zones return a UTC string. Either outcome must be well-formed.
    const out = toUtcIso('2026-03-08T02:30');
    if (out !== null) {
      expect(out).toMatch(/Z$/);
      expect(Number.isNaN(new Date(out).getTime())).toBe(false);
    }
  });
});

describe('toLocalInputValue', () => {
  it('formats a date as a datetime-local value that round-trips', () => {
    const value = toLocalInputValue(new Date(2026, 9, 12, 14, 30, 45));
    expect(value).toBe('2026-10-12T14:30');
    expect(parseLocalParts(value)).toEqual({
      year: 2026,
      month: 10,
      day: 12,
      hour: 14,
      minute: 30,
    });
    expect(toUtcIso(value)).toMatch(/Z$/);
  });

  it('zero-pads single-digit components', () => {
    expect(toLocalInputValue(new Date(2026, 0, 5, 8, 7))).toBe('2026-01-05T08:07');
  });
});

describe('toLocalDate', () => {
  it('round-trips through toLocalInputValue', () => {
    const date = toLocalDate('2026-10-12T14:30');
    expect(date).toBeInstanceOf(Date);
    expect(toLocalInputValue(date!)).toBe('2026-10-12T14:30');
  });

  it('returns null for invalid input', () => {
    expect(toLocalDate('')).toBeNull();
    expect(toLocalDate('tomorrow at noon')).toBeNull();
    expect(toLocalDate('2026-13-12T14:30')).toBeNull();
  });
});
