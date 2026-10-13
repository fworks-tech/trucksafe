import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { FakeMap } = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];

    focusCalls: Array<{ center: unknown; zoom: unknown }> = [];
    removed = false;

    handlers: Array<{ event: string; fn: (...args: never[]) => void }> = [];

    constructor(public readonly options: unknown) {
      FakeMap.instances.push(this);
    }

    on(event: string, fn: (...args: never[]) => void): void {
      this.handlers.push({ event, fn });
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

    jumpTo(options: { center: unknown; zoom: unknown }): void {
      this.focusCalls.push({ center: options.center, zoom: options.zoom });
    }

    remove(): void {
      this.removed = true;
    }
  }

  return { FakeMap };
});

vi.mock('maplibre-gl', () => {
  return { Map: FakeMap };
});

import { renderWithProviders } from '../../../test/render';
import { lookupCityCoordinates } from '../../features/route-planning/cities';
import { OriginFocusMap } from './OriginFocusMap';

function stubWebgl(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
}

function chicago(): { latitude: number; longitude: number } {
  const point = lookupCityCoordinates('Chicago, IL');
  if (point === null) throw new Error('Chicago must resolve');
  return point;
}

afterEach(() => {
  FakeMap.instances.length = 0;
  vi.restoreAllMocks();
});

describe('OriginFocusMap', () => {
  it('renders the map region naming the city and centers on it', async () => {
    stubWebgl();
    renderWithProviders(<OriginFocusMap center={chicago()} cityName="Chicago, IL" />);
    // The container is visibility-hidden until the style loads.
    FakeMap.instances[0]?.emit('load');
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /showing chicago, il/i }),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(FakeMap.instances[0]?.focusCalls).toHaveLength(1);
    });
    expect(FakeMap.instances[0]?.focusCalls[0]?.center).toEqual([-87.6298, 41.8781]);
  });

  it('refocuses when the origin city changes', async () => {
    stubWebgl();
    const denver = lookupCityCoordinates('Denver, CO');
    expect(denver).not.toBeNull();
    const { rerender } = renderWithProviders(
      <OriginFocusMap center={chicago()} cityName="Chicago, IL" />,
    );
    FakeMap.instances[0]?.emit('load');
    await waitFor(() => {
      expect(FakeMap.instances[0]?.focusCalls).toHaveLength(1);
    });
    rerender(<OriginFocusMap center={denver} cityName="Denver, CO" />);
    await waitFor(() => {
      expect(FakeMap.instances[0]?.focusCalls).toHaveLength(2);
    });
    expect(
      screen.getByRole('region', { name: /showing denver, co/i }),
    ).toBeInTheDocument();
  });

  it('keeps the viewport when the city is unknown', async () => {
    stubWebgl();
    renderWithProviders(<OriginFocusMap center={null} cityName="Nowhere, ZZ" />);
    FakeMap.instances[0]?.emit('load');
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /showing nowhere, zz/i }),
      ).toBeInTheDocument();
    });
    expect(FakeMap.instances[0]?.focusCalls).toHaveLength(0);
  });
});
