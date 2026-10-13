import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { ForecastSection } from './ForecastSection';

const DEPARTURE = '2026-10-13T15:00:00Z';

describe('ForecastSection', () => {
  it('starts collapsed so route information stays visible first', () => {
    renderWithProviders(
      <ForecastSection value={0} onChange={() => {}} departureAt={DEPARTURE} />,
    );
    expect(screen.getByText('Forecast')).toBeInTheDocument();
    // Header summary mirrors the slider label (hidden until expanded).
    expect(screen.getAllByText('Departure time')).toHaveLength(2);
    expect(screen.getByRole('slider', { hidden: true })).not.toBeVisible();
  });

  it('expands to a 0-48 hour slider with timestamp and error state', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ForecastSection
        value={24}
        onChange={() => {}}
        departureAt={DEPARTURE}
        error="Weather provider temporarily unavailable."
      />,
    );
    await user.click(screen.getByText('Forecast'));
    const slider = screen.getByRole('slider', { name: /forecast hour offset/i });
    expect(slider).toBeVisible();
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '48');
    expect(slider).toHaveAttribute('aria-valuenow', '24');
    // Header summary and slider label agree on the offset.
    expect(screen.getAllByText('+24h')).toHaveLength(2);
    expect(screen.getByText(/weather forecast unavailable/i)).toBeVisible();
  });

  it('notifies the sheet when the slider settles on a new offset', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    renderWithProviders(
      <ForecastSection
        value={0}
        onChange={(v) => seen.push(v)}
        departureAt={DEPARTURE}
      />,
    );
    await user.click(screen.getByText('Forecast'));
    const slider = screen.getByRole('slider', { name: /forecast hour offset/i });
    slider.focus();
    await user.keyboard('{End}');
    expect(seen).toContain(48);
  });
});
