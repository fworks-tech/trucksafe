/** Thin MapLibre GL JS boundary for route-plan visualization.
 *
 * This is the only module that touches the map library, so unit and
 * component tests can mock `maplibre-gl` here without touching rendering
 * logic. The adapter receives data already normalized by `geo.ts` and
 * never parses backend payloads. All text shown on the map is set with
 * `textContent` (never HTML); the DOM-based route list remains the
 * accessible source of truth.
 */

import {
  Map as MapLibreMap,
  Marker,
  Popup,
  type AddLayerObject,
  type MapLayerMouseEvent,
} from 'maplibre-gl';

import type { LngLat, MappableCheckpoint, MappableRouteLine, MapBounds } from './geo';

const ROUTES_SOURCE = 'trucksafe-routes';
const CHECKPOINTS_SOURCE = 'trucksafe-checkpoints';
const ROUTE_LINES_LAYER = 'trucksafe-route-lines';
const ROUTE_SELECTED_LAYER = 'trucksafe-route-selected';
const CHECKPOINT_LAYER = 'trucksafe-checkpoints';
const CHECKPOINT_SELECTED_LAYER = 'trucksafe-checkpoint-selected';

export type MapInitFailure = 'webgl-unavailable' | 'style-missing' | 'init-failed';

export class MapAdapterError extends Error {
  readonly kind: MapInitFailure;

  constructor(kind: MapInitFailure, message: string) {
    super(message);
    this.name = 'MapAdapterError';
    this.kind = kind;
  }
}

/** One route line, already validated by `geo.ts`. */
export type RouteLineEntry = MappableRouteLine;

/** One checkpoint marker, already validated by `geo.ts`. */
export type CheckpointEntry = MappableCheckpoint;

export interface RouteMapCallbacks {
  onRouteSelect?: (routeId: string) => void;
  onCheckpointSelect?: (checkpointId: string) => void;
  onRuntimeError?: () => void;
}

const LINE_COLORS: Record<RouteLineEntry['state'], string> = {
  'recommended-selected': '#0d47a1',
  recommended: '#0d47a1',
  selected: '#0d47a1',
  eligible: '#455a64',
  ineligible: '#9e9e9e',
  'no-travel': '#5c0a14',
};

const LINE_WIDTHS: Record<RouteLineEntry['state'], number> = {
  'recommended-selected': 7,
  recommended: 5,
  selected: 6,
  eligible: 3,
  ineligible: 3,
  'no-travel': 3,
};

const LINE_OPACITIES: Record<RouteLineEntry['state'], number> = {
  'recommended-selected': 1,
  selected: 1,
  recommended: 0.95,
  eligible: 0.7,
  ineligible: 0.5,
  'no-travel': 0.85,
};

const CHECKPOINT_COLORS: Record<string, string> = {
  LOW: '#1b5e20',
  MODERATE: '#7a5c00',
  HIGH: '#8a3c00',
  SEVERE: '#a31226',
  NO_TRAVEL: '#5c0a14',
  unavailable: '#78909c',
};

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function matchState<T extends string | number>(
  mapping: Record<RouteLineEntry['state'], T>,
): ['match', ['get', string], ...unknown[]] {
  return [
    'match',
    ['get', 'state'],
    'recommended-selected',
    mapping['recommended-selected'],
    'recommended',
    mapping['recommended'],
    'selected',
    mapping['selected'],
    'ineligible',
    mapping['ineligible'],
    'no-travel',
    mapping['no-travel'],
    mapping['eligible'],
  ];
}

type LineLayer = Extract<AddLayerObject, { type: 'line' }>;
type LinePaint = LineLayer extends { paint?: infer P } ? P : never;
type CircleLayer = Extract<AddLayerObject, { type: 'circle' }>;
type CirclePaint = CircleLayer extends { paint?: infer P } ? P : never;

/** Pass a programmatically built style expression to MapLibre.
 *
 * The style-spec types only accept hand-written expression literals, so
 * generated `match` tuples cross this single documented assertion.
 * MapLibre validates the expression shape again at runtime when the
 * layer is added; a malformed expression surfaces as a layer error,
 * never as a wrong map.
 */
function asExpression<T>(value: unknown): T {
  return value as T;
}

/** Owns one MapLibre instance: sources, layers, markers, listeners. */
export class RouteMapAdapter {
  private layersReady = false;

  private constructor(
    private readonly map: MapLibreMap,
    private readonly callbacks: RouteMapCallbacks,
    private markers: Marker[],
    private popup: Popup | null,
  ) {}

  /** Create the map inside `container`. Rejects with `MapAdapterError`. */
  static async create(
    container: HTMLElement,
    styleUrl: string,
    callbacks: RouteMapCallbacks = {},
  ): Promise<RouteMapAdapter> {
    if (styleUrl === '') {
      throw new MapAdapterError('style-missing', 'No map style is configured.');
    }
    if (!webglAvailable()) {
      throw new MapAdapterError(
        'webgl-unavailable',
        'This browser cannot render WebGL maps.',
      );
    }
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: styleUrl,
        fadeDuration: 0,
      });
    } catch {
      throw new MapAdapterError('init-failed', 'The map could not be initialized.');
    }
    const adapter = new RouteMapAdapter(map, callbacks, [], null);
    await adapter.whenReady();
    adapter.bindInteractions();
    return adapter;
  }

  /** Resolve on first style load; reject when the style fails instead. */
  private whenReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onLoad = (): void => {
        this.map.off('error', onError);
        resolve();
      };
      const onError = (): void => {
        this.map.off('load', onLoad);
        reject(new MapAdapterError('init-failed', 'The map style could not be loaded.'));
      };
      this.map.once('load', onLoad);
      this.map.once('error', onError);
    });
  }

  private bindInteractions(): void {
    this.map.on('click', ROUTE_LINES_LAYER, (event: MapLayerMouseEvent) => {
      const routeId = event.features?.[0]?.properties['routeId'];
      if (typeof routeId === 'string') this.callbacks.onRouteSelect?.(routeId);
    });
    this.map.on('click', CHECKPOINT_LAYER, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const checkpointId = feature?.properties['checkpointId'];
      if (typeof checkpointId === 'string') {
        this.callbacks.onCheckpointSelect?.(checkpointId);
        const coordinates = (feature?.geometry as { coordinates?: LngLat } | undefined)
          ?.coordinates;
        if (coordinates !== undefined) this.showPopup(coordinates);
      }
    });
    this.map.on('error', () => {
      this.callbacks.onRuntimeError?.();
    });
  }

  /** Replace all route and checkpoint layers for a new response. */
  setRoutes(routes: RouteLineEntry[], checkpoints: CheckpointEntry[]): void {
    const routeFeatures = routes.map((route) => ({
      type: 'Feature' as const,
      properties: { routeId: route.routeId, state: route.state },
      geometry: { type: 'LineString' as const, coordinates: route.coordinates },
    }));
    this.upsertSource(ROUTES_SOURCE, {
      type: 'FeatureCollection' as const,
      features: routeFeatures,
    });
    if (!this.layersReady) {
      const lineLayer: AddLayerObject = {
        id: ROUTE_LINES_LAYER,
        type: 'line',
        source: ROUTES_SOURCE,
        paint: {
          'line-color': asExpression<LinePaint['line-color']>(matchState(LINE_COLORS)),
          'line-width': asExpression<LinePaint['line-width']>(matchState(LINE_WIDTHS)),
          'line-opacity': asExpression<LinePaint['line-opacity']>(
            matchState(LINE_OPACITIES),
          ),
          'line-dasharray': asExpression<LinePaint['line-dasharray']>([
            'match',
            ['get', 'state'],
            'ineligible',
            ['literal', [2, 2]],
            'no-travel',
            ['literal', [5, 2.5]],
            ['literal', [1]],
          ]),
        },
      };
      this.map.addLayer(lineLayer);
      this.map.addLayer({
        id: ROUTE_SELECTED_LAYER,
        type: 'line',
        source: ROUTES_SOURCE,
        paint: {
          'line-color': '#0d47a1',
          'line-width': 8,
          'line-opacity': 0.35,
        },
      });
    }

    const checkpointFeatures = checkpoints.map((checkpoint) => ({
      type: 'Feature' as const,
      properties: {
        checkpointId: checkpoint.checkpointId,
        routeId: checkpoint.routeId,
        risk: checkpoint.weatherAvailable
          ? (checkpoint.risk ?? 'unavailable')
          : 'unavailable',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [checkpoint.longitude, checkpoint.latitude],
      },
    }));
    this.upsertSource(CHECKPOINTS_SOURCE, {
      type: 'FeatureCollection' as const,
      features: checkpointFeatures,
    });
    if (!this.layersReady) {
      this.map.addLayer({
        id: CHECKPOINT_LAYER,
        type: 'circle',
        source: CHECKPOINTS_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': asExpression<CirclePaint['circle-color']>([
            'match',
            ['get', 'risk'],
            ...Object.entries(CHECKPOINT_COLORS).flat(),
            '#455a64',
          ]),
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      this.map.addLayer({
        id: CHECKPOINT_SELECTED_LAYER,
        type: 'circle',
        source: CHECKPOINTS_SOURCE,
        paint: {
          'circle-radius': 11,
          'circle-color': 'rgba(13, 71, 161, 0.25)',
          'circle-stroke-color': '#0d47a1',
          'circle-stroke-width': 3,
        },
      });
      this.layersReady = true;
    }
  }

  /** Emphasize the selected route and checkpoint without refitting. */
  setSelected(selectedRouteId: string | null, checkpointId: string | null): void {
    if (!this.layersReady) return;
    this.map.setFilter(ROUTE_SELECTED_LAYER, [
      '==',
      ['get', 'routeId'],
      selectedRouteId ?? '__none__',
    ]);
    this.map.setFilter(CHECKPOINT_SELECTED_LAYER, [
      '==',
      ['get', 'checkpointId'],
      checkpointId ?? '__none__',
    ]);
  }

  /** Place origin, destination, and recommendation markers. */
  setMarkers(markers: {
    origin: LngLat;
    destination: LngLat;
    recommendedMidpoint: LngLat | null;
  }): void {
    for (const marker of this.markers) marker.remove();
    const created: Marker[] = [];
    const origin = this.labeledMarker('Origin', '#0d47a1');
    origin.setLngLat(markers.origin).addTo(this.map);
    created.push(origin);
    const destination = this.labeledMarker('Destination', '#1b5e20');
    destination.setLngLat(markers.destination).addTo(this.map);
    created.push(destination);
    if (markers.recommendedMidpoint !== null) {
      const badge = this.labeledMarker('Recommended', '#0d47a1');
      badge.setLngLat(markers.recommendedMidpoint).addTo(this.map);
      created.push(badge);
    }
    this.markers = created;
  }

  private labeledMarker(label: string, color: string): Marker {
    const element = document.createElement('div');
    element.textContent = label;
    element.setAttribute('aria-hidden', 'true');
    element.style.background = color;
    element.style.color = '#ffffff';
    element.style.fontSize = '12px';
    element.style.fontWeight = '700';
    element.style.padding = '2px 8px';
    element.style.borderRadius = '999px';
    element.style.border = '2px solid #ffffff';
    element.style.whiteSpace = 'nowrap';
    return new Marker({ element });
  }

  /** Fit the viewport to validated bounds; never animates on reduce-motion. */
  fitToBounds(bounds: MapBounds): void {
    this.map.fitBounds(
      [
        [bounds.minLongitude, bounds.minLatitude],
        [bounds.maxLongitude, bounds.maxLatitude],
      ],
      { padding: 48, animate: !prefersReducedMotion() },
    );
  }

  private showPopup(at: LngLat): void {
    this.popup?.remove();
    // setText keeps provider-derived content as plain text, never HTML.
    this.popup = new Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(at)
      .setText('Checkpoint details are listed below the map.')
      .addTo(this.map);
  }

  private upsertSource(
    id: string,
    data: { type: 'FeatureCollection'; features: unknown[] },
  ): void {
    if (this.layersReady) {
      // GeoJSONSource is not exported as a type; narrow through unknown
      // in this one spot instead of threading source handles around.
      const source = this.map.getSource(id) as unknown as
        { setData: (next: typeof data) => void } | undefined;
      source?.setData(data);
    } else {
      this.map.addSource(id, { type: 'geojson', data });
    }
  }

  destroy(): void {
    this.popup?.remove();
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    this.map.remove();
  }
}
