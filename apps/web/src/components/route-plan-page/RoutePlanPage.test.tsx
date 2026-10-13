import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  routePlansHandler,
  type CapturedRequest,
  type Scenario,
} from '../../features/route-planning/api/handlers';
import { RoutePlanPage } from './RoutePlanPage';
import { renderWithProviders } from '../../../test/render';

const server = setupServer();
let captured: CapturedRequest = { headers: {}, body: null };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setScenario(scenario: Scenario, delayMs = 0): void {
  captured = { headers: {}, body: null };
  server.resetHandlers();
  server.use(routePlansHandler(scenario, captured, delayMs));
}

async function fillAndSubmit(): Promise<void> {
  // Origin, departure, and load ship prefilled; clear before typing so
  // keystrokes do not append to the defaults.
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/^origin/i));
  await user.type(screen.getByLabelText(/^origin/i), 'Chicago, IL');
  await user.type(screen.getByLabelText(/^destination/i), 'Dallas, TX');
  await user.clear(screen.getByLabelText(/departure date and time/i));
  await user.type(screen.getByLabelText(/departure date and time/i), '2026-10-12T14:30');
  await user.clear(screen.getByLabelText(/load weight/i));
  await user.type(screen.getByLabelText(/load weight/i), '20000');
  await user.click(screen.getByRole('button', { name: /plan route/i }));
}

describe('RoutePlanPage', () => {
  it(
    'submits the correct payload and renders exactly three routes',
    { timeout: 15000 },
    async () => {
      setScenario('success', 150);
      renderWithProviders(<RoutePlanPage />);
      await fillAndSubmit();

      await screen.findByText(/creating your route plan/i);
      expect(screen.getByRole('button', { name: /planning/i })).toBeDisabled();

      await screen.findByText('Route alternatives (3)');
      expect(captured.headers['content-type']).toContain('application/json');
      const body = captured.body as Record<string, unknown>;
      expect(body['origin']).toEqual({ address: 'Chicago, IL' });
      expect(body['destination']).toEqual({ address: 'Dallas, TX' });
      expect(body['departure_at']).toMatch(/Z$/);
      expect(body['load_weight_lb']).toBe(20000);
      expect(body['checkpoint_interval_miles']).toBe(25);
      expect(captured.headers['x-request-id']).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
      // The request id is available for diagnostics on success too.
      expect(screen.getByText(/Request ID:/)).toBeInTheDocument();
    },
  );

  it('identifies the recommended route with the backend reason', async () => {
    setScenario('success');
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    await screen.findByText('Recommended: Route 1');
    expect(screen.getByText(/deterministic route ranking criteria/)).toBeInTheDocument();
  });

  it.each([
    {
      scenario: 'badRequest',
      message: 'Please review the route plan details.',
    },
    {
      scenario: 'unroutable',
      message: 'The submitted values are not valid for route planning.',
    },
    {
      scenario: 'provider',
      message: 'A route or weather provider failed while creating this plan.',
    },
    {
      scenario: 'unavailable',
      message: 'The route planning service is temporarily unavailable. Please try again.',
    },
  ] as const)('renders a safe message for $scenario', async ({ scenario, message }) => {
    setScenario(scenario);
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(/Request ID:/)).toBeInTheDocument();
  });

  it('renders a generic message for malformed payloads', async () => {
    setScenario('malformed');
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    expect(
      await screen.findByText('We could not create the route plan. Please try again.'),
    ).toBeInTheDocument();
  });

  it('renders a safe message for network failures', async () => {
    setScenario('networkError');
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    expect(
      await screen.findByText(/could not reach the route planning service/i),
    ).toBeInTheDocument();
  });

  it('shows no recommendation and keeps every route when all are ineligible', async () => {
    setScenario('allIneligible');
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    await screen.findByText('No eligible route available.');
    expect(screen.queryByText('Recommended: Route 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not eligible')).toHaveLength(3);
    expect(
      screen.getByText(/no eligible route available; no recommendation made/),
    ).toBeInTheDocument();
  });

  it('renders unavailable weather distinctly without crashing on sparse data', async () => {
    setScenario('minimal');
    const user = userEvent.setup();
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    await screen.findByText('Route alternatives (1)');
    await user.click(screen.getByText(/Checkpoints \(2\)/));
    expect(screen.getAllByText('Weather unavailable').length).toBeGreaterThan(0);
    expect(screen.queryByText('Risk: Low')).not.toBeInTheDocument();
  });

  it('starts a new plan without stale results', async () => {
    setScenario('success');
    const user = userEvent.setup();
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    await screen.findByText('Recommended: Route 1');

    await user.click(screen.getByRole('button', { name: /start new plan/i }));
    await waitFor(() => {
      expect(screen.queryByText('Recommended: Route 1')).not.toBeInTheDocument();
    });
    // Valid input is preserved; a fresh submission works.
    expect(screen.getByLabelText(/^origin/i)).toHaveValue('Chicago, IL');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    await screen.findByText('Recommended: Route 1');
    expect(screen.getAllByText('Recommended: Route 1')).toHaveLength(1);
  });
});

describe('RoutePlanPage map integration', () => {
  it('shows the background map before any plan instead of a placeholder', async () => {
    // jsdom has no WebGL, so the origin focus map degrades to its
    // fallback immediately — but the map slot itself is always present.
    setScenario('success');
    renderWithProviders(<RoutePlanPage />);
    expect(
      await screen.findByText('The interactive map could not be loaded'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Map preview')).not.toBeInTheDocument();
  });

  it('falls back to the accessible route cards when the map cannot start', async () => {
    // jsdom has no WebGL, so the lazy map section degrades to its
    // fallback while the bottom-sheet cards stay fully working — and no
    // second floating selection surface appears either.
    setScenario('success');
    renderWithProviders(<RoutePlanPage />);
    await fillAndSubmit();
    await screen.findByText('Route alternatives (3)');
    expect(
      await screen.findByText('The interactive map could not be loaded'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Show on map' })).toHaveLength(2);
  });

  it(
    'syncs selection through the cards and resets on a new plan',
    { timeout: 15000 },
    async () => {
      setScenario('success');
      const user = userEvent.setup();
      renderWithProviders(<RoutePlanPage />);
      await fillAndSubmit();
      await screen.findByText('Route alternatives (3)');
      await screen.findByText('The interactive map could not be loaded');

      // Card button selects; the non-recommended card gains the Selected chip.
      await user.click(screen.getAllByRole('button', { name: 'Show on map' })[0]!);
      expect(screen.getByRole('button', { name: 'Selected on map' })).toBeInTheDocument();

      // A new plan clears the viewing selection back to the recommendation.
      await user.click(screen.getByRole('button', { name: /start new plan/i }));
      await waitFor(() => {
        expect(screen.queryByText('Route alternatives (3)')).not.toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /plan route/i }));
      await screen.findByText('Route alternatives (3)');
      await screen.findByText('The interactive map could not be loaded');
      expect(screen.getByText('Recommended: Route 1')).toBeInTheDocument();
    },
  );

  it(
    'warns visibly when the plan uses demonstration (mock) geometry',
    { timeout: 15000 },
    async () => {
      setScenario('mockSuccess');
      renderWithProviders(<RoutePlanPage />);
      await fillAndSubmit();
      await screen.findByText('Route alternatives (3)');
      expect(screen.getByText(/Demonstration geometry/)).toBeVisible();
    },
  );

  it(
    'dismisses the demonstration notice while keeping the routes',
    { timeout: 15000 },
    async () => {
      setScenario('mockSuccess');
      const user = userEvent.setup();
      renderWithProviders(<RoutePlanPage />);
      await fillAndSubmit();
      await screen.findByText('Route alternatives (3)');
      const banner = screen.getByText(/Demonstration geometry/).closest('[role="alert"]');
      expect(banner).not.toBeNull();
      await user.click(
        within(banner as HTMLElement).getByRole('button', { name: 'Close' }),
      );
      expect(screen.queryByText(/Demonstration geometry/)).not.toBeInTheDocument();
      expect(screen.getByText('Route alternatives (3)')).toBeInTheDocument();
    },
  );
});
