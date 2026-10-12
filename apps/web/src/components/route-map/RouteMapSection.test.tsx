import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { FakeMap } = vi.hoisted(() => {
  interface Handler {
    event: string;
    layer: string | null;
    fn: (...args: never[]) => void;
  }

  class FakeMap {
    static instances: FakeMap[] = [];

    handlers: Handler[] = [];
    filters: Record<string, unknown> = {};
    fitBoundsCalls: number = 0;
    removed = false;

    constructor(public readonly options: unknown) {
      FakeMap.instances.push(this);
    }

    on(event: string, layerOrFn: unknown, maybeFn?: unknown): void {
      this.handlers.push({
        event,
        layer: typeof layerOrFn === 'string' ? layerOrFn : null,
        fn: (typeof layerOrFn === 'string' ? maybeFn : layerOrFn) as (
          ...args: never[]
        ) => void,
      });
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

    clickLayer(layer: string, payload: unknown): void {
      const handler = this.handlers.find((h) => h.event === 'click' && h.layer === layer);
      handler?.fn(payload as never);
    }

    addSource(): void {}

    getSource(): { setData: () => void } {
      return { setData: () => {} };
    }

    addLayer(): void {}

    setFilter(layer: string, filter: unknown): void {
      this.filters[layer] = filter;
    }

    fitBounds(): void {
      this.fitBoundsCalls += 1;
    }

    remove(): void {
      this.removed = true;
    }
  }

  return { FakeMap };
});

vi.mock('maplibre-gl', () => {
  class FakeMarker {
    setLngLat(): this {
      return this;
    }

    addTo(): this {
      return this;
    }

    remove(): void {}
  }

  class FakePopup {
    setLngLat(): this {
      return this;
    }

    setText(): this {
      return this;
    }

    addTo(): this {
      return this;
    }

    remove(): void {}
  }

  return {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
  };
});

import { makeRoute, makeRoutePlan } from '../../features/route-planning/fixtures';
import { renderWithProviders } from '../../../test/render';
import { RouteMapSection } from './RouteMapSection';

function stubWebgl(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
}

afterEach(() => {
  FakeMap.instances.length = 0;
  vi.restoreAllMocks();
});

describe('RouteMapSection', () => {
  it('renders the map, legend, and accessible route list', async () => {
    stubWebgl();
    const plan = makeRoutePlan();
    renderWithProviders(
      <RouteMapSection
        response={plan}
        selectedRouteId="route-1"
        onSelectRoute={() => {}}
      />,
    );
    expect(screen.getByLabelText('Loading map')).toBeInTheDocument();
    FakeMap.instances[0]?.emit('load');
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading map')).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('region', { name: /interactive route map/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Map legend')).toBeInTheDocument();
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(
      screen.getByRole('radio', { name: /route-1.*recommended/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /route-2.*alternative/i }),
    ).toBeInTheDocument();
  });

  it('syncs selection from the list, the map, and back', async () => {
    stubWebgl();
    const user = userEvent.setup();
    const seen: string[] = [];
    const plan = makeRoutePlan();
    const { rerender } = renderWithProviders(
      <RouteMapSection
        response={plan}
        selectedRouteId="route-1"
        onSelectRoute={(id) => seen.push(id)}
      />,
    );
    FakeMap.instances[0]?.emit('load');
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading map')).not.toBeInTheDocument();
    });
    // List -> callback.
    await user.click(screen.getByRole('radio', { name: /route-2.*alternative/i }));
    expect(seen).toEqual(['route-2']);
    // Map click -> callback.
    FakeMap.instances[0]?.clickLayer('trucksafe-route-lines', {
      features: [{ properties: { routeId: 'route-3' } }],
    });
    expect(seen).toEqual(['route-2', 'route-3']);
    // Prop change -> adapter emphasis, no refit.
    const map = FakeMap.instances[0];
    const fitsBefore = map?.fitBoundsCalls ?? 0;
    rerender(
      <RouteMapSection
        response={plan}
        selectedRouteId="route-2"
        onSelectRoute={(id) => seen.push(id)}
      />,
    );
    await waitFor(() => {
      expect(map?.filters['trucksafe-route-selected']).toEqual([
        '==',
        ['get', 'routeId'],
        'route-2',
      ]);
    });
    expect(map?.fitBoundsCalls).toBe(fitsBefore);
  });

  it('shows checkpoint details picked on the map and closes them', async () => {
    stubWebgl();
    const user = userEvent.setup();
    const plan = makeRoutePlan();
    const firstCheckpoint = plan.routes[0]?.checkpoints[0];
    if (firstCheckpoint === undefined) throw new Error('fixture has no checkpoints');
    renderWithProviders(
      <RouteMapSection
        response={plan}
        selectedRouteId="route-1"
        onSelectRoute={() => {}}
      />,
    );
    FakeMap.instances[0]?.emit('load');
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading map')).not.toBeInTheDocument();
    });
    FakeMap.instances[0]?.clickLayer('trucksafe-checkpoints', {
      features: [
        {
          properties: { checkpointId: firstCheckpoint.checkpoint_id },
          geometry: { coordinates: [-87.63, 41.88] },
        },
      ],
    });
    // First fixture checkpoint of route-1: origin with LOW risk.
    expect(
      await screen.findByRole('heading', { name: /checkpoint 1 of route/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close checkpoint details/i }));
    expect(
      screen.queryByRole('heading', { name: /checkpoint 1 of route/i }),
    ).not.toBeInTheDocument();
  });

  it('falls back accessibly when no route has geometry', () => {
    const plan = makeRoutePlan({
      routes: [makeRoute('route-1', { geometryNull: true })],
    });
    const seen: string[] = [];
    renderWithProviders(
      <RouteMapSection
        response={plan}
        selectedRouteId="route-1"
        onSelectRoute={(id) => seen.push(id)}
      />,
    );
    expect(screen.getByText('Map unavailable for this result')).toBeInTheDocument();
    expect(FakeMap.instances).toHaveLength(0);
    // The list alternative still works.
    expect(screen.getByRole('radio', { name: /route-1.*no map geometry/i }));
    expect(seen).toEqual([]);
  });

  it('falls back when the style fails and retries on demand', async () => {
    stubWebgl();
    const user = userEvent.setup();
    renderWithProviders(
      <RouteMapSection
        response={makeRoutePlan()}
        selectedRouteId="route-1"
        onSelectRoute={() => {}}
      />,
    );
    FakeMap.instances[0]?.emit('error');
    expect(
      await screen.findByText('The interactive map could not be loaded'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry map/i }));
    expect(FakeMap.instances).toHaveLength(2);
  });

  it('has no axe violations with a ready map and with the fallback', async () => {
    stubWebgl();
    const { container, unmount } = renderWithProviders(
      <RouteMapSection
        response={makeRoutePlan()}
        selectedRouteId="route-1"
        onSelectRoute={() => {}}
      />,
    );
    FakeMap.instances[0]?.emit('load');
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading map')).not.toBeInTheDocument();
    });
    const ready = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(ready.violations.map((violation) => violation.id)).toEqual([]);
    unmount();

    const fallback = renderWithProviders(
      <RouteMapSection
        response={makeRoutePlan({
          routes: [makeRoute('route-1', { geometryNull: true })],
        })}
        selectedRouteId="route-1"
        onSelectRoute={() => {}}
      />,
    );
    const results = await axe.run(fallback.container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
