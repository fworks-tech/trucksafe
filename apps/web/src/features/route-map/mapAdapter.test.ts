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

    emit(event: string, ...args: never[]): void {
      for (const handler of this.handlers.filter((h) => h.event === event)) {
        handler.fn(...args);
      }
    }

    addSource(id: string, spec: unknown): void {
      this.addedSources.push({ id, spec });
    }

    getSource(id: string): { setData: (data: unknown) => void } {
      return {
        setData: (data: unknown): void => {
          const updates = this.sourceUpdates[id] ?? [];
          updates.push(data);
          this.sourceUpdates[id] = updates;
        },
      };
    }

    addLayer(layer: unknown): void {
      this.addedLayers.push(layer);
    }

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

import { RouteMapAdapter, type CheckpointEntry, type RouteLineEntry } from './mapAdapter';

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

  it('reports runtime errors after load and cleans up on destroy', async () => {
    const onRuntimeError = vi.fn();
    const { adapter, map } = await readyAdapter({ onRuntimeError });
    adapter.setRoutes(LINES, POINTS);
    adapter.setMarkers({
      origin: [-87.63, 41.88],
      destination: [-87.0, 41.0],
      recommendedMidpoint: [-87.3, 41.4],
    });
    map.emit('error');
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
