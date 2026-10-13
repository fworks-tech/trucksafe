/**
 * Curated US city suggestions for the origin/destination autocomplete.
 * Mirrors the backend mock geocoder table (`_KNOWN_ADDRESSES`), so every
 * suggestion resolves to real coordinates even in mock (offline) mode.
 * Free text still works: it is sent to the backend, which geocodes it
 * (mock hashes unknown addresses; the OSRM adapter resolves them for real).
 */
export const US_CITIES: readonly string[] = [
  'Albuquerque, NM',
  'Atlanta, GA',
  'Austin, TX',
  'Baltimore, MD',
  'Birmingham, AL',
  'Boston, MA',
  'Charlotte, NC',
  'Chicago, IL',
  'Cincinnati, OH',
  'Cleveland, OH',
  'Colorado Springs, CO',
  'Columbus, OH',
  'Dallas, TX',
  'Denver, CO',
  'Detroit, MI',
  'El Paso, TX',
  'Fort Worth, TX',
  'Houston, TX',
  'Indianapolis, IN',
  'Jackson, MS',
  'Jacksonville, FL',
  'Kansas City, MO',
  'Los Angeles, CA',
  'Louisville, KY',
  'Memphis, TN',
  'Miami, FL',
  'Milwaukee, WI',
  'Minneapolis, MN',
  'Nashville, TN',
  'New Orleans, LA',
  'New York, NY',
  'Oklahoma City, OK',
  'Omaha, NE',
  'Philadelphia, PA',
  'Phoenix, AZ',
  'Pittsburgh, PA',
  'Portland, OR',
  'Raleigh, NC',
  'Salt Lake City, UT',
  'San Antonio, TX',
  'San Diego, CA',
  'San Francisco, CA',
  'Seattle, WA',
  'St. Louis, MO',
  'Tampa, FL',
  'Tucson, AZ',
  'Tulsa, OK',
  'Wichita, KS',
];

export const CITY_COORDINATES: Readonly<
  Record<string, { readonly latitude: number; readonly longitude: number }>
> = {
  'Albuquerque, NM': { latitude: 35.0844, longitude: -106.6504 },
  'Atlanta, GA': { latitude: 33.749, longitude: -84.388 },
  'Austin, TX': { latitude: 30.2672, longitude: -97.7431 },
  'Baltimore, MD': { latitude: 39.2904, longitude: -76.6122 },
  'Birmingham, AL': { latitude: 33.5186, longitude: -86.8104 },
  'Boston, MA': { latitude: 42.3601, longitude: -71.0589 },
  'Charlotte, NC': { latitude: 35.2271, longitude: -80.8431 },
  'Chicago, IL': { latitude: 41.8781, longitude: -87.6298 },
  'Cincinnati, OH': { latitude: 39.1031, longitude: -84.512 },
  'Cleveland, OH': { latitude: 41.4993, longitude: -81.6944 },
  'Colorado Springs, CO': { latitude: 38.8339, longitude: -104.8214 },
  'Columbus, OH': { latitude: 39.9612, longitude: -82.9988 },
  'Dallas, TX': { latitude: 32.7767, longitude: -96.797 },
  'Denver, CO': { latitude: 39.7392, longitude: -104.9903 },
  'Detroit, MI': { latitude: 42.3314, longitude: -83.0458 },
  'El Paso, TX': { latitude: 31.7619, longitude: -106.485 },
  'Fort Worth, TX': { latitude: 32.7555, longitude: -97.3308 },
  'Houston, TX': { latitude: 29.7604, longitude: -95.3698 },
  'Indianapolis, IN': { latitude: 39.7684, longitude: -86.1581 },
  'Jackson, MS': { latitude: 32.2988, longitude: -90.1848 },
  'Jacksonville, FL': { latitude: 30.3322, longitude: -81.6557 },
  'Kansas City, MO': { latitude: 39.0997, longitude: -94.5786 },
  'Louisville, KY': { latitude: 38.2527, longitude: -85.7585 },
  'Los Angeles, CA': { latitude: 34.0522, longitude: -118.2437 },
  'Memphis, TN': { latitude: 35.1495, longitude: -90.049 },
  'Miami, FL': { latitude: 25.7617, longitude: -80.1918 },
  'Milwaukee, WI': { latitude: 43.0389, longitude: -87.9065 },
  'Minneapolis, MN': { latitude: 44.9778, longitude: -93.265 },
  'Nashville, TN': { latitude: 36.1627, longitude: -86.7816 },
  'New Orleans, LA': { latitude: 29.9511, longitude: -90.0715 },
  'New York, NY': { latitude: 40.7128, longitude: -74.006 },
  'Oklahoma City, OK': { latitude: 35.4676, longitude: -97.5164 },
  'Omaha, NE': { latitude: 41.2565, longitude: -95.9345 },
  'Philadelphia, PA': { latitude: 39.9526, longitude: -75.1652 },
  'Phoenix, AZ': { latitude: 33.4484, longitude: -112.074 },
  'Pittsburgh, PA': { latitude: 40.4406, longitude: -79.9959 },
  'Portland, OR': { latitude: 45.5152, longitude: -122.6784 },
  'Raleigh, NC': { latitude: 35.7796, longitude: -78.6382 },
  'Salt Lake City, UT': { latitude: 40.7608, longitude: -111.891 },
  'San Antonio, TX': { latitude: 29.4241, longitude: -98.4936 },
  'San Diego, CA': { latitude: 32.7157, longitude: -117.1611 },
  'San Francisco, CA': { latitude: 37.7749, longitude: -122.4194 },
  'Seattle, WA': { latitude: 47.6062, longitude: -122.3321 },
  'St. Louis, MO': { latitude: 38.627, longitude: -90.1994 },
  'Tampa, FL': { latitude: 27.9506, longitude: -82.4572 },
  'Tucson, AZ': { latitude: 32.2226, longitude: -110.9747 },
  'Tulsa, OK': { latitude: 36.154, longitude: -95.9928 },
  'Wichita, KS': { latitude: 37.6872, longitude: -97.3301 },
};

export interface CityCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** Default focus when the origin names no known city. */
export const DEFAULT_ORIGIN_CITY = 'Chicago, IL';

/**
 * Resolve a city name to coordinates (case-insensitive). Returns null
 * for unknown free text so callers keep the last known viewport.
 *
 * Canonical source: `apps/api/providers/mock_routing.py::_KNOWN_ADDRESSES`.
 * Keep the tables identical when either changes.
 */
const COORDINATES_BY_LOWER_NAME: ReadonlyMap<string, CityCoordinates> = new Map(
  Object.entries(CITY_COORDINATES).map(([city, point]) => [
    city.toLowerCase(),
    { latitude: point.latitude, longitude: point.longitude },
  ]),
);

export function lookupCityCoordinates(name: string): CityCoordinates | null {
  return COORDINATES_BY_LOWER_NAME.get(name.trim().toLowerCase()) ?? null;
}
