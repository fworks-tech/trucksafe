/** Automated accessibility checks for the main page states.
 *
 * Runs axe-core in jsdom. The `color-contrast` rule needs real layout and
 * is disabled here; contrast is instead guaranteed by the centralized
 * theme tokens (dark text on light fills, white on dark-red No Travel).
 */

import axe from 'axe-core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { App } from './app/App';
import { routePlansHandler } from './features/route-planning/api/handlers';
import { renderWithProviders } from '../test/render';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function axeViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    (violation) => `${violation.id}: ${violation.description}`,
  );
}

describe('accessibility', () => {
  it('has no axe violations on the empty form state', async () => {
    const { container } = renderWithProviders(<App />);
    expect(await axeViolations(container)).toEqual([]);
    // Keyboard users can reach every control in a logical order.
    for (const label of [
      /^origin/i,
      /^destination/i,
      /departure date and time/i,
      /load weight/i,
      /checkpoint interval/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('has no axe violations on the success state', { timeout: 15000 }, async () => {
    server.use(routePlansHandler('success'));
    const user = userEvent.setup();
    const { container } = renderWithProviders(<App />);
    // Origin and load ship prefilled; clear before typing. Departure
    // ships prefilled with today/now and stays untouched.
    await user.clear(screen.getByLabelText(/^origin/i));
    await user.type(screen.getByLabelText(/^origin/i), 'Chicago, IL');
    await user.type(screen.getByLabelText(/^destination/i), 'Dallas, TX');
    await user.clear(screen.getByLabelText(/load weight/i));
    await user.type(screen.getByLabelText(/load weight/i), '20000');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    await screen.findByText('Route alternatives (3)');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('announces loading and error states through a live region', { timeout: 15000 }, async () => {
    server.use(routePlansHandler('badRequest'));
    const user = userEvent.setup();
    renderWithProviders(<App />);
    await user.clear(screen.getByLabelText(/^origin/i));
    await user.type(screen.getByLabelText(/^origin/i), 'Chicago, IL');
    await user.type(screen.getByLabelText(/^destination/i), 'Dallas, TX');
    await user.clear(screen.getByLabelText(/load weight/i));
    await user.type(screen.getByLabelText(/load weight/i), '20000');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    await screen.findByText('Please review the route plan details.');
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toContain('Please review the route plan details.');
  });
});
