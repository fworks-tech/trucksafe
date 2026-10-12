import { describe, expect, it } from 'vitest';

import {
  makeCheckpoint,
  makeRoute,
  makeRoutePlan,
  type RouteOverrides,
} from '../route-planning/fixtures';
import {
  boundsForPositions,
  normalizeCheckpointPoint,
  normalizePlanMap,
  normalizeRouteGeometry,
  routeVisualState,
  toLngLat,
} from './geo';

describe('toLngLat', () => {
  it('accepts GeoJSON [longitude, latitude] order', () => {
    expect(toLngLat([-87.63, 41.88])).toEqual([-87.63, 41.88]);
  });

  it('rejects non-arrays, short arrays, and non-numbers', () => {
    expect(toLngLat(null)).toBeNull();
    expect(toLngLat('12,34')).toBeNull();
    expect(toLngLat([1])).toBeNull();
    expect(toLngLat(['a', 'b'])).toBeNull();
    expect(toLngLat([1, 2, 3].slice(0, 1))).toBeNull();
  });

  it('rejects NaN, Infinity, and out-of-range values', () => {
    expect(toLngLat([Number.NaN, 41])).toBeNull();
    expect(toLngLat([10, Number.POSITIVE_INFINITY])).toBeNull();
    expect(toLngLat([-180.1, 41])).toBeNull();
    expect(toLngLat([180.1, 41])).toBeNull();
    expect(toLngLat([10, -90.1])).toBeNull();
    expect(toLngLat([10, 90.1])).toBeNull();
  });

  it('accepts the exact WGS84 edges', () => {
    expect(toLngLat([-180, -90])).toEqual([-180, -90]);
    expect(toLngLat([180, 90])).toEqual([180, 90]);
  });
});

describe('normalizeRouteGeometry', () => {
  it('accepts a valid LineString', () => {
    expect(
      normalizeRouteGeometry({
        type: 'LineString',
        coordinates: [
          [-87.63, 41.88],
          [-87.0, 41.0],
        ],
      }),
    ).toEqual({
      coordinates: [
        [-87.63, 41.88],
        [-87.0, 41.0],
      ],
    });
  });

  it('rejects wrong types, empty lines, and single points', () => {
    expect(normalizeRouteGeometry(null)).toBeNull();
    expect(normalizeRouteGeometry('LineString')).toBeNull();
    expect(
      normalizeRouteGeometry({ type: 'Point', coordinates: [-87.63, 41.88] }),
    ).toBeNull();
    expect(normalizeRouteGeometry({ type: 'LineString', coordinates: [] })).toBeNull();
    expect(
      normalizeRouteGeometry({ type: 'LineString', coordinates: [[-87.63, 41.88]] }),
    ).toBeNull();
  });

  it('rejects malformed nested coordinate structures', () => {
    expect(
      normalizeRouteGeometry({ type: 'LineString', coordinates: 'nope' }),
    ).toBeNull();
    expect(
      normalizeRouteGeometry({
        type: 'LineString',
        coordinates: [[-87.63, 41.88], ['x']],
      }),
    ).toBeNull();
    expect(
      normalizeRouteGeometry({
        type: 'LineString',
        coordinates: [
          [-87.63, 41.88],
          [200, 41],
        ],
      }),
    ).toBeNull();
  });
});

describe('normalizeCheckpointPoint', () => {
  it('accepts in-range latitude/longitude fields', () => {
    expect(normalizeCheckpointPoint({ latitude: 41.88, longitude: -87.63 })).toEqual({
      latitude: 41.88,
      longitude: -87.63,
    });
  });

  it('rejects out-of-range or non-finite fields', () => {
    expect(normalizeCheckpointPoint({ latitude: 91, longitude: -87.63 })).toBeNull();
    expect(normalizeCheckpointPoint({ latitude: 41.88, longitude: -181 })).toBeNull();
    expect(normalizeCheckpointPoint({ latitude: Number.NaN, longitude: 0 })).toBeNull();
  });
});

describe('boundsForPositions', () => {
  it('returns null for no positions', () => {
    expect(boundsForPositions([])).toBeNull();
  });

  it('computes the bounding box', () => {
    expect(
      boundsForPositions([
        [-87.63, 41.88],
        [-87.0, 41.0],
      ]),
    ).toEqual({
      minLongitude: -87.63,
      minLatitude: 41.0,
      maxLongitude: -87.0,
      maxLatitude: 41.88,
    });
  });

  it('pads a zero-area box so it can be fitted', () => {
    const bounds = boundsForPositions([
      [-87.0, 41.0],
      [-87.0, 41.0],
    ]);
    expect(bounds).not.toBeNull();
    expect(bounds!.minLongitude).toBeLessThan(bounds!.maxLongitude);
    expect(bounds!.minLatitude).toBeLessThan(bounds!.maxLatitude);
  });
});

describe('normalizePlanMap', () => {
  const options = { selectedRouteId: 'route-2', recommendedRouteId: 'route-1' };

  it('normalizes lines, checkpoints, bounds, and markers', () => {
    const model = normalizePlanMap(makeRoutePlan(), options);
    expect(model.lines).toHaveLength(3);
    expect(model.lines.map((line) => line.routeId)).toEqual([
      'route-1',
      'route-2',
      'route-3',
    ]);
    // 3 routes x 3 fixture checkpoints.
    expect(model.checkpoints).toHaveLength(9);
    expect(model.checkpoints[0]).toMatchObject({ role: 'origin' });
    expect(model.checkpoints[2]).toMatchObject({ role: 'destination' });
    expect(model.bounds).not.toBeNull();
    // Origin/destination follow the selected route's checkpoints.
    expect(model.origin).toEqual([-87.63, 41.88]);
    expect(model.destination).toEqual([-87.63, 41.88]);
    expect(model.recommendedMidpoint).not.toBeNull();
  });

  it('omits invalid geometry but keeps valid checkpoints', () => {
    const plan = makeRoutePlan({
      routes: [
        makeRoute('route-1', { geometryNull: true }),
        makeRoute('route-2', { rank: 2 }),
      ],
    });
    const model = normalizePlanMap(plan, {
      selectedRouteId: null,
      recommendedRouteId: 'route-2',
    });
    expect(model.lines.map((line) => line.routeId)).toEqual(['route-2']);
    // Checkpoints of the geometry-less route are still mapped.
    expect(model.checkpoints.filter((point) => point.routeId === 'route-1')).toHaveLength(
      3,
    );
    expect(model.bounds).not.toBeNull();
  });

  it('returns empty markers and null bounds without any geometry', () => {
    const plan = makeRoutePlan({
      routes: [makeRoute('route-1', { geometryNull: true })],
    });
    const model = normalizePlanMap(plan, {
      selectedRouteId: null,
      recommendedRouteId: null,
    });
    expect(model.lines).toHaveLength(0);
    expect(model.bounds).toBeNull();
    // Checkpoint coordinates are still valid, so markers survive.
    expect(model.origin).not.toBeNull();
    expect(model.destination).not.toBeNull();
    expect(model.recommendedMidpoint).toBeNull();
  });

  it('skips checkpoints with invalid coordinates', () => {
    const bad = makeCheckpoint({ distanceMiles: 10 });
    bad.latitude = 200;
    const plan = makeRoutePlan({
      routes: [makeRoute('route-1', { checkpoints: [bad] })],
    });
    const model = normalizePlanMap(plan, {
      selectedRouteId: null,
      recommendedRouteId: 'route-1',
    });
    expect(model.checkpoints).toHaveLength(0);
    // Falls back to line endpoints for markers.
    expect(model.origin).toEqual([-87.63, 41.88]);
    expect(model.destination).toEqual([-87.0, 41.0]);
  });
});

describe('routeVisualState', () => {
  const options = { selectedRouteId: 'route-2', recommendedRouteId: 'route-1' };

  function routeWith(id: string, overrides: RouteOverrides = {}) {
    const route = makeRoute(id, { rank: 1, ...overrides });
    if (route.geometry === null) return { ...route, geometry: null };
    return {
      ...route,
      geometry: {
        coordinates: [
          [-87.63, 41.88],
          [-87.0, 41.0],
        ] as [number, number][],
      },
    };
  }

  it('maps recommended, selected, and combined states', () => {
    expect(routeVisualState(routeWith('route-1', { recommended: true }), options)).toBe(
      'recommended',
    );
    expect(routeVisualState(routeWith('route-2'), options)).toBe('selected');
    expect(
      routeVisualState(routeWith('route-1', { recommended: true }), {
        selectedRouteId: 'route-1',
        recommendedRouteId: 'route-1',
      }),
    ).toBe('recommended-selected');
    expect(
      routeVisualState(routeWith('route-3'), {
        selectedRouteId: null,
        recommendedRouteId: null,
      }),
    ).toBe('eligible');
  });

  it('marks No Travel above eligibility and recommendation', () => {
    const noTravel = routeWith('route-1', {
      recommended: true,
      noTravelMiles: 2,
    });
    expect(routeVisualState(noTravel, options)).toBe('no-travel');
    const worstNoTravel = routeWith('route-2', {
      checkpoints: [makeCheckpoint({ riskLevel: 'NO_TRAVEL', riskScore: 5 })],
    });
    expect(routeVisualState(worstNoTravel, options)).toBe('no-travel');
  });

  it('marks ineligible routes and geometry-less routes as list-only', () => {
    expect(routeVisualState(routeWith('route-3', { eligible: false }), options)).toBe(
      'ineligible',
    );
    expect(routeVisualState(routeWith('route-3', { geometryNull: true }), options)).toBe(
      'no-geometry',
    );
  });
});
