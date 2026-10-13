import { describe, expect, it } from 'vitest';

import {
  CITY_COORDINATES,
  DEFAULT_ORIGIN_CITY,
  US_CITIES,
  lookupCityCoordinates,
} from './cities';

describe('lookupCityCoordinates', () => {
  it('resolves every suggested city to finite WGS84 coordinates', () => {
    for (const city of US_CITIES) {
      const point = lookupCityCoordinates(city);
      expect(point, city).not.toBeNull();
      expect(Number.isFinite(point?.latitude)).toBe(true);
      expect(Number.isFinite(point?.longitude)).toBe(true);
    }
  });

  it('matches case-insensitively and trims whitespace', () => {
    expect(lookupCityCoordinates('  chicago, il ')).toEqual(
      CITY_COORDINATES['Chicago, IL'],
    );
  });

  it('returns null for unknown free text so callers keep their viewport', () => {
    expect(lookupCityCoordinates('Nowhere, ZZ')).toBeNull();
    expect(lookupCityCoordinates('')).toBeNull();
  });

  it('defaults the origin to a known city', () => {
    expect(lookupCityCoordinates(DEFAULT_ORIGIN_CITY)).not.toBeNull();
  });
});
