import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoutePlanPage } from '../route-plan-page/RoutePlanPage';
import { renderWithProviders } from '../../../test/render';
import { GuidedTour } from './GuidedTour';
import { TourBanner } from './TourBanner';
import { readTourState } from './storage';

const STATE_KEY = 'trucksafe.guided-tour.v1.state';

function mockLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    width: 120,
    height: 40,
    top: 20,
    right: 130,
    bottom: 60,
    left: 10,
    toJSON: () => undefined,
  } as DOMRect);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TourBanner', () => {
  it('renders the entry banner with a clear call to action', () => {
    renderWithProviders(<TourBanner onStart={() => {}} refreshToken={0} />);
    expect(screen.getByRole('button', { name: 'Start guided tour' })).toBeInTheDocument();
    expect(screen.getByText('Explore TruckSafe')).toBeInTheDocument();
  });

  it('starts the tour without persisting anything yet', async () => {
    const user = userEvent.setup();
    let started = 0;
    renderWithProviders(
      <TourBanner
        onStart={() => {
          started += 1;
        }}
        refreshToken={0}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Start guided tour' }));
    expect(started).toBe(1);
    expect(readTourState()).toBeNull();
  });

  it('dismisses to a compact restart action and persists the dismissal', async () => {
    const user = userEvent.setup();
    let started = 0;
    renderWithProviders(
      <TourBanner
        onStart={() => {
          started += 1;
        }}
        refreshToken={0}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss tour banner' }));
    expect(screen.queryByText('Explore TruckSafe')).not.toBeInTheDocument();
    expect(readTourState()).toBe('dismissed');
    await user.click(screen.getByRole('button', { name: /guided tour/i }));
    expect(started).toBe(1);
  });

  it('shows the compact restart form for completed and stale states', () => {
    window.localStorage.setItem(STATE_KEY, 'completed');
    const { unmount } = renderWithProviders(
      <TourBanner onStart={() => {}} refreshToken={0} />,
    );
    expect(
      screen.getByRole('button', { name: 'Restart the guided tour' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Explore TruckSafe')).not.toBeInTheDocument();
    unmount();
    // Stale values behave as first visit, never as completed.
    window.localStorage.setItem(STATE_KEY, 'garbage');
    renderWithProviders(<TourBanner onStart={() => {}} refreshToken={1} />);
    expect(screen.getByText('Explore TruckSafe')).toBeInTheDocument();
  });
});

describe('GuidedTour', () => {
  function openTour(props?: { hasResults?: boolean; mockMode?: boolean }): void {
    renderWithProviders(
      <div data-tour="origin-input">
        <GuidedTour
          hasResults={props?.hasResults ?? false}
          mockMode={props?.mockMode ?? false}
          onUseExample={() => {}}
          onClose={() => {}}
        />
      </div>,
    );
  }

  it('hides Previous on the first step and shows progress', () => {
    openTour();
    expect(screen.getByText('Welcome to TruckSafe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tour progress' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    expect(screen.getByText('Step 1 of 12')).toBeInTheDocument();
  });

  it('navigates forward and backward through anchored steps', async () => {
    mockLayout();
    const user = userEvent.setup();
    openTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Origin and destination')).toBeInTheDocument();
    expect(screen.getByTestId('tour-spotlight')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tour progress' })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Welcome to TruckSafe')).toBeInTheDocument();
  });

  it('shows Finish and Restart on the final step', async () => {
    const user = userEvent.setup();
    let closed = 0;
    const { container } = renderWithProviders(
      <GuidedTour
        hasResults={false}
        mockMode={false}
        onUseExample={() => {}}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
    // Walk the whole tour; missing result targets fall back safely.
    for (let step = 0; step < 11; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByText('You are ready to use TruckSafe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish tour' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restart tour' }));
    expect(screen.getByText('Welcome to TruckSafe')).toBeInTheDocument();
    expect(container.textContent).toContain('Step 1 of 12');
    // Finish from the final step closes and persists completion.
    for (let step = 0; step < 11; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: 'Finish tour' }));
    expect(closed).toBe(1);
    expect(readTourState()).toBe('completed');
  });

  it('skips and closes on Escape, persisting completion', async () => {
    const user = userEvent.setup();
    let closed = 0;
    const { unmount } = renderWithProviders(
      <GuidedTour
        hasResults={false}
        mockMode={false}
        onUseExample={() => {}}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(closed).toBe(1);
    expect(readTourState()).toBe('completed');
    unmount();

    window.localStorage.clear();
    let escaped = 0;
    renderWithProviders(
      <GuidedTour
        hasResults={false}
        mockMode={false}
        onUseExample={() => {}}
        onClose={() => {
          escaped += 1;
        }}
      />,
    );
    await user.keyboard('{Escape}');
    expect(escaped).toBe(1);
    expect(readTourState()).toBe('completed');
  });

  it('falls back safely when result targets are missing', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GuidedTour
        hasResults={false}
        mockMode={false}
        onUseExample={() => {}}
        onClose={() => {}}
      />,
    );
    // Advance to the first result step without any results present.
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByText('Route alternatives')).toBeInTheDocument();
    expect(screen.getByText(/No route results yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument();
  });

  it('offers the example trip only where it makes sense', async () => {
    const user = userEvent.setup();
    let examples = 0;
    renderWithProviders(
      <GuidedTour
        hasResults={false}
        mockMode={false}
        onUseExample={() => {
          examples += 1;
        }}
        onClose={() => {}}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Use example trip' }),
    ).not.toBeInTheDocument();
    for (let step = 0; step < 5; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByText('Generate a route plan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use example trip' }));
    expect(examples).toBe(1);
  });

  it('uses dialog semantics with a labelled title and description', () => {
    renderWithProviders(
      <GuidedTour
        hasResults={false}
        mockMode={false}
        onUseExample={() => {}}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'guided-tour-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'guided-tour-body');
    expect(within(dialog).getByText('Welcome to TruckSafe')).toBeInTheDocument();
  });
});

describe('GuidedTour on the page', () => {
  it('opens from the banner, preserves input, and never autoplays', async () => {
    const user = userEvent.setup();
    // Completed state: no tour on mount.
    window.localStorage.setItem(STATE_KEY, 'completed');
    const { unmount } = renderWithProviders(<RoutePlanPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    window.localStorage.clear();
    renderWithProviders(<RoutePlanPage />);
    await user.click(screen.getByRole('button', { name: 'Start guided tour' }));
    expect(screen.getByText('Welcome to TruckSafe')).toBeInTheDocument();
    // Navigate without generating: input untouched, no results created.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Departure time')).toBeInTheDocument();
    expect(screen.getByLabelText(/^origin/i)).toHaveValue('Chicago, IL');
    expect(screen.queryByText('Route alternatives (3)')).not.toBeInTheDocument();
  });
});
