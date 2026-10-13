import { afterEach, describe, expect, it, vi } from 'vitest';

const { FakeMap, FakeMarker, FakePopup, fakeState } = vi.hoisted(() => {
  interface Handler {
    event: string;
    layer: string | null;
    fn: (...args: never[]) => void;
  }

  const fakeState = { failConstruction: false };

  class FakeMap {
    static instances: FakeMap[] = [];

    handlers: Handler[] = [];
    addedSources: Array<{ id: string; spec: unknown }> = [];
    addedLayers: unknown[] = [];
    sourceUpdates: Record<string, unknown[]> = {};
    sources: Record<string, { setData: (data: unknown) => void }> = {};
    filters: Record<string, unknown> = {};
    fitBoundsCalls: Array<{ bounds: unknown; options: unknown }> = [];
    removed = false;

    constructor(public readonly options: unknown) {
      if (fakeState.failConstruction) throw new Error('construction boom');
      FakeMap.instances.push(this);
    }

    on(event: string, layerOrFn: unknown, maybeFn?: unknown): void {
      if (typeof layerOrFn === 'string') {
        this.handlers.push({
          event,
          layer: layerOrFn,
          fn: maybeFn as (...args: never[]) => void,
        });
      } else {
        this.handlers.push({
          event,
          layer: null,
          fn: layerOrFn as (...args: never[]) => void,
        });
      }
    }

    once(event: string, fn: (...args: never[]) => void): void {
      this.on(event, fn);
    }

    off(event: string, fn: (...args: never[]) => void): void {
      this.handlers = this.handlers.filter(
        (handler) => handler.event !== event || handler.fn !== fn,
      );
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.filter((h) => h.event === event)) {
        (handler.fn as (...a: unknown[]) => void)(...args);
      }
    }

    addSource(id: string, spec: unknown): void {
      this.addedSources.push({ id, spec });
      this.sources[id] = {
        setData: (data: unknown): void => {
          const updates = this.sourceUpdates[id] ?? [];
          updates.push(data);
          this.sourceUpdates[id] = updates;
        },
      };
    }

    getSource(id: string): { setData: (data: unknown) => void } | undefined {
      return this.sources[id];
    }

    addLayer(layer: unknown): void {
      this.addedLayers.push(layer);
    }

    getLayer(id: string): unknown {
      return this.addedLayers.find((layer) => (layer as { id?: string }).id === id);
    }

    removeLayer(id: string): void {
      this.addedLayers = this.addedLayers.filter(
        (layer) => (layer as { id?: string }).id !== id,
      );
    }

    removeSource(id: string): void {
      delete this.sources[id];
      this.addedSources = this.addedSources.filter((source) => source.id !== id);
    }

    setLayoutProperty(): void {}

    zoomIn(): void {}

    zoomOut(): void {}

    setFilter(layer: string, filter: unknown): void {
      this.filters[layer] = filter;
    }

    fitBounds(bounds: unknown, options: unknown): void {
      this.fitBoundsCalls.push({ bounds, options });
    }

    remove(): void {
      this.removed = true;
    }
  }

  class FakeMarker {
    element: HTMLElement | null = null;
    lngLat: unknown = null;
    removed = false;

    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element ?? null;
    }

    setLngLat(lngLat: unknown): this {
      this.lngLat = lngLat;
      return this;
    }

    addTo(): this {
      return this;
    }

    remove(): void {
      this.removed = true;
    }
  }

  class FakePopup {
    text: string | null = null;
    removed = false;

    setLngLat(): this {
      return this;
    }

    setText(text: string): this {
      this.text = text;
      return this;
    }

    addTo(): this {
      return this;
    }

    remove(): void {
      this.removed = true;
    }
  }

  return { FakeMap, FakeMarker, FakePopup, fakeState };
});

vi.mock('maplibre-gl', () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  Popup: FakePopup,
}));

import {
  lineStyleFor,
  RouteMapAdapter,
  type CheckpointEntry,
  type RouteLineEntry,
} from './mapAdapter';

describe('lineStyleFor', () => {
  it('never emits a match-expression label (only plain per-feature values)', () => {
    const selected = lineStyleFor('recommended-selected', 'HIGH');
    expect(selected).toEqual({
      color: expect.any(String),
      width: expect.any(Number),
      opacity: expect.any(Number),
      dash: 'solid',
    });
    expect(selected.width).toBeGreaterThanOrEqual(7);
    expect(lineStyleFor('no-travel', 'NO_TRAVEL').dash).toBe('long');
    expect(lineStyleFor('eligible', 'unavailable').dash).toBe('fine');
    // Colors are hex strings, never expression arrays.
    for (const state of ['recommended', 'eligible', 'ineligible', 'no-travel'] as const) {
      expect(lineStyleFor(state, null).color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

function stubWebgl(available: boolean): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    (available ? {} : null) as never,
  );
}

const LINES: RouteLineEntry[] = [
  {
    routeId: 'route-1',
    state: 'recommended',
    coordinates: [
      [-87.63, 41.88],
      [-87.0, 41.0],
    ],
  },
  {
    routeId: 'route-2',
    state: 'eligible',
    coordinates: [
      [-87.63, 41.88],
      [-86.9, 40.9],
    ],
  },
];

const POINTS: CheckpointEntry[] = [
  {
    checkpointId: 'cp-1',
    routeId: 'route-1',
    longitude: -87.63,
    latitude: 41.88,
    risk: 'LOW',
    weatherAvailable: true,
    sequence: 1,
    role: 'origin',
  },
  {
    checkpointId: 'cp-2',
    routeId: 'route-1',
    longitude: -87.0,
    latitude: 41.0,
    risk: null,
    weatherAvailable: false,
    sequence: 2,
    role: 'destination',
  },
];

afterEach(() => {
  FakeMap.instances.length = 0;
  vi.restoreAllMocks();
});

describe('RouteMapAdapter.create', () => {
  it('rejects a missing style without touching the map library', async () => {
    stubWebgl(true);
    await expect(
      RouteMapAdapter.create(document.createElement('div'), ''),
    ).rejects.toMatchObject({ name: 'MapAdapterError', kind: 'style-missing' });
    expect(FakeMap.instances).toHaveLength(0);
  });

  it('rejects when WebGL is unavailable', async () => {
    stubWebgl(false);
    await expect(
      RouteMapAdapter.create(document.createElement('div'), 'style.json'),
    ).rejects.toMatchObject({
      name: 'MapAdapterError',
      kind: 'webgl-unavailable',
    });
    expect(FakeMap.instances).toHaveLength(0);
  });

  it('rejects when the style fails to load', async () => {
    stubWebgl(true);
    const pending = RouteMapAdapter.create(document.createElement('div'), 'style.json');
    FakeMap.instances[0]?.emit('error');
    await expect(pending).rejects.toMatchObject({
      name: 'MapAdapterError',
      kind: 'init-failed',
    });
  });

  it('resolves on style load', async () => {
    stubWebgl(true);
    const pending = RouteMapAdapter.create(document.createElement('div'), 'style.json');
    FakeMap.instances[0]?.emit('load');
    const adapter = await pending;
    expect(adapter).toBeInstanceOf(RouteMapAdapter);
    adapter.destroy();
  });
});

describe('RouteMapAdapter layers', () => {
  async function readyAdapter(
    callbacks: Parameters<typeof RouteMapAdapter.create>[2] = {},
  ): Promise<{ adapter: RouteMapAdapter; map: InstanceType<typeof FakeMap> }> {
    stubWebgl(true);
    const pending = RouteMapAdapter.create(
      document.createElement('div'),
      'style.json',
      callbacks,
    );
    FakeMap.instances[0]?.emit('load');
    const adapter = await pending;
    const map = FakeMap.instances[0];
    if (map === undefined) throw new Error('map was not constructed');
    return { adapter, map };
  }

  it('adds route and checkpoint sources with layers once', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.setRoutes(LINES, POINTS);
    adapter.setRoutes(LINES, POINTS);
    expect(map.addedSources.map((source) => source.id)).toEqual([
      'trucksafe-routes',
      'trucksafe-checkpoints',
    ]);
    expect(map.addedLayers).toHaveLength(4);
    expect(map.sourceUpdates['trucksafe-routes']).toHaveLength(1);
    expect(map.sourceUpdates['trucksafe-checkpoints']).toHaveLength(1);
    adapter.destroy();
  });

  it('creates the heatmap source before its layer (regression: map teardown)', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.setRoutes(LINES, POINTS);
    const grid = {
      cells: [
        {
          cellId: 'cell-1',
          longitude: -87.5,
          latitude: 41.5,
          risk: 'HIGH' as const,
          riskScore: 3,
          riskReasons: [],
          windMph: 40,
          rainInchesPerHour: null,
          snowInchesPerHour: null,
        },
      ],
      bounds: null,
      forecastStart: '2026-10-14T13:00:00Z',
      forecastEnd: '2026-10-14T14:00:00Z',
    };
    adapter.setHeatmap(grid);
    const sourceIds = map.addedSources.map((source) => source.id);
    const layerIds = map.addedLayers.map((layer) => (layer as { id: string }).id);
    expect(sourceIds).toContain('trucksafe-heatmap');
    expect(layerIds).toContain('trucksafe-heatmap');
    // Second update goes through setData, not a duplicate source.
    adapter.setHeatmap(grid);
    expect(map.addedSources.filter((s) => s.id === 'trucksafe-heatmap')).toHaveLength(1);
    expect(map.sourceUpdates['trucksafe-heatmap']).toHaveLength(1);
    adapter.destroy();
  });

  it('paints lines with per-feature values only (no match-expression labels)', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.setRoutes(LINES, POINTS, {
      'route-1': [
        {
          startIndex: 0,
          endIndex: 1,
          risk: 'NO_TRAVEL',
          coordinates: LINES[0]!.coordinates,
        },
        {
          startIndex: 1,
          endIndex: 2,
          risk: null,
          coordinates: LINES[0]!.coordinates,
        },
      ],
    });
    const lineLayer = map.addedLayers.find(
      (layer) => (layer as { id: string }).id === 'trucksafe-route-lines',
    ) as { paint: Record<string, unknown> };
    for (const key of ['line-color', 'line-width', 'line-opacity']) {
      expect(lineLayer.paint[key]).toEqual(['get', key.slice(5)]);
    }
    const features = (
      map.addedSources[0]!.spec as {
        data: { features: Array<{ properties: Record<string, unknown> }> };
      }
    ).data.features;
    expect(features[0]!.properties).toMatchObject({
      color: expect.any(String),
      width: expect.any(Number),
      opacity: expect.any(Number),
      dash: 'long',
    });
    expect(features[1]!.properties.dash).not.toBe('long');
    // Every `match` label must be a constant, never an expression: the
    // only match we emit is the dash toggle; labels sit at indexes 2 and 4.
    const dash = lineLayer.paint['line-dasharray'] as unknown[];
    expect(dash[0]).toBe('match');
    expect([dash[2], dash[4]].every((label) => !Array.isArray(label))).toBe(true);
    adapter.destroy();
  });

  it('updates selection filters without refitting the viewport', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.setRoutes(LINES, POINTS);
    adapter.setSelected('route-2', 'cp-2');
    expect(map.filters['trucksafe-route-selected']).toEqual([
      '==',
      ['get', 'routeId'],
      'route-2',
    ]);
    expect(map.filters['trucksafe-checkpoint-selected']).toEqual([
      '==',
      ['get', 'checkpointId'],
      'cp-2',
    ]);
    expect(map.fitBoundsCalls).toHaveLength(0);
    adapter.destroy();
  });

  it('fits validated bounds with padding', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.fitToBounds({
      minLongitude: -87.63,
      minLatitude: 41.0,
      maxLongitude: -87.0,
      maxLatitude: 41.88,
    });
    expect(map.fitBoundsCalls).toEqual([
      {
        bounds: [
          [-87.63, 41.0],
          [-87.0, 41.88],
        ],
        options: expect.objectContaining({ padding: 48 }),
      },
    ]);
    adapter.destroy();
  });

  it('forwards route clicks and checkpoint clicks with popup text', async () => {
    const onRouteSelect = vi.fn();
    const onCheckpointSelect = vi.fn();
    const { adapter, map } = await readyAdapter({
      onRouteSelect,
      onCheckpointSelect,
    });
    adapter.setRoutes(LINES, POINTS);
    const routeClick = map.handlers.find(
      (handler) => handler.layer === 'trucksafe-route-lines',
    );
    routeClick?.fn({
      features: [{ properties: { routeId: 'route-2' } }],
    } as never);
    expect(onRouteSelect).toHaveBeenCalledWith('route-2');
    const pointClick = map.handlers.find(
      (handler) => handler.layer === 'trucksafe-checkpoints',
    );
    pointClick?.fn({
      features: [
        {
          properties: { checkpointId: 'cp-1' },
          geometry: { coordinates: [-87.63, 41.88] },
        },
      ],
    } as never);
    expect(onCheckpointSelect).toHaveBeenCalledWith('cp-1');
    adapter.destroy();
  });

  it('reports layer/style runtime errors and ignores transient tile errors', async () => {
    const onRuntimeError = vi.fn();
    const { adapter, map } = await readyAdapter({ onRuntimeError });
    adapter.setRoutes(LINES, POINTS);
    adapter.setMarkers({
      origin: [-87.63, 41.88],
      destination: [-87.0, 41.0],
      recommendedMidpoint: [-87.3, 41.4],
    });
    map.emit('error', { error: { message: 'tile 5/12/8: Could not load image' } });
    expect(onRuntimeError).not.toHaveBeenCalled();
    map.emit('error', {
      error: { message: 'layer trucksafe-route-lines: bad expression' },
    });
    expect(onRuntimeError).toHaveBeenCalledTimes(1);
    adapter.destroy();
    expect(map.removed).toBe(true);
  });

  it('rejects construction failure as init-failed', async () => {
    stubWebgl(true);
    fakeState.failConstruction = true;
    try {
      await expect(
        RouteMapAdapter.create(document.createElement('div'), 'style.json'),
      ).rejects.toMatchObject({
        name: 'MapAdapterError',
        kind: 'init-failed',
      });
    } finally {
      fakeState.failConstruction = false;
    }
  });
});

describe('RouteMapAdapter segment risk', () => {
  async function readyAdapter(): Promise<{
    adapter: RouteMapAdapter;
    map: InstanceType<typeof FakeMap>;
  }> {
    stubWebgl(true);
    const pending = RouteMapAdapter.create(document.createElement('div'), 'style.json');
    FakeMap.instances[0]?.emit('load');
    const adapter = await pending;
    const map = FakeMap.instances[0];
    if (map === undefined) throw new Error('map was not constructed');
    return { adapter, map };
  }

  const SEGMENTS = {
    'route-1': [
      {
        startIndex: 0,
        endIndex: 1,
        risk: 'MODERATE' as const,
        coordinates: [
          [-87.63, 41.88],
          [-87.0, 41.0],
        ] as [number, number][],
      },
      {
        startIndex: 1,
        endIndex: 2,
        risk: null,
        coordinates: [
          [-87.0, 41.0],
          [-87.5, 41.5],
        ] as [number, number][],
      },
    ],
  };

  it('writes one feature per segment with its risk level', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.setRoutes(LINES, POINTS);
    adapter.setRoutes(LINES, POINTS, SEGMENTS);

    const updates = map.sourceUpdates['trucksafe-routes']!;
    expect(updates).toHaveLength(1);
    const features = (
      updates[0] as { features: Array<{ properties: Record<string, unknown> }> }
    ).features;
    expect(features).toHaveLength(3);
    expect(features[0]!.properties['riskLevel']).toBe('MODERATE');
    expect(features[1]!.properties['riskLevel']).toBe('unavailable');
    expect(features[1]!.properties['routeId']).toBe('route-1');
    expect(features[2]!.properties['routeId']).toBe('route-2');
    expect(features[2]!.properties['riskLevel']).toBe('unavailable');
    adapter.destroy();
  });

  it('falls back to one feature per route without segments', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.setRoutes(LINES, POINTS);
    adapter.setRoutes(LINES, POINTS);

    const updates = map.sourceUpdates['trucksafe-routes']!;
    expect(updates).toHaveLength(1);
    const features = (
      updates[0] as { features: Array<{ properties: Record<string, unknown> }> }
    ).features;
    expect(features).toHaveLength(2);
    expect(features[0]!.properties['state']).toBe('recommended');
    expect(features[0]!.properties['riskLevel']).toBeUndefined();
    adapter.destroy();
  });

  it('updates segment features on later responses', async () => {
    const { adapter, map } = await readyAdapter();
    adapter.setRoutes(LINES, POINTS);
    adapter.setRoutes(LINES, POINTS, SEGMENTS);
    adapter.setRoutes(LINES, POINTS, SEGMENTS);

    const updates = map.sourceUpdates['trucksafe-routes']!;
    expect(updates).toHaveLength(2);
    const features = (
      updates[1] as { features: Array<{ properties: Record<string, unknown> }> }
    ).features;
    expect(features).toHaveLength(3);
    expect(features[0]!.properties['riskLevel']).toBe('MODERATE');
    adapter.destroy();
  });
});
