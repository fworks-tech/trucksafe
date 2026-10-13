import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { US_CITIES } from '../../features/route-planning/cities';
import { renderWithProviders } from '../../../test/render';
import { RoutePlanForm } from './RoutePlanForm';

describe('RoutePlanForm city autocomplete', () => {
  it('offers curated cities that the backend mock actually resolves', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RoutePlanForm onSubmit={() => {}} isPending={false} onCancel={() => {}} />,
    );
    expect(US_CITIES).toContain('Houston, TX');
    // Origin ships prefilled; clear before searching.
    await user.clear(screen.getByLabelText(/^origin/i));
    await user.click(screen.getByLabelText(/^origin/i));
    await user.keyboard('houst');
    expect(await screen.findByRole('option', { name: 'Houston, TX' })).toBeVisible();
  });

  it('commits typed free text and quick-example pairs', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    renderWithProviders(
      <RoutePlanForm
        onSubmit={(values) => seen.push(`${values.origin}|${values.destination}`)}
        isPending={false}
        onCancel={() => {}}
      />,
    );
    // Origin ships prefilled (Chicago, IL); destination starts empty.
    expect(screen.getByLabelText(/^origin/i)).toHaveValue('Chicago, IL');
    await user.click(screen.getByRole('button', { name: /phoenix, az to denver, co/i }));
    expect(screen.getByLabelText(/^origin/i)).toHaveValue('Phoenix, AZ');
    await user.clear(screen.getByLabelText(/^destination/i));
    await user.type(screen.getByLabelText(/^destination/i), 'Miami, FL');
    // Departure and load ship prefilled (today, 30 lb); clear before typing.
    await user.clear(screen.getByLabelText(/departure date and time/i));
    await user.type(
      screen.getByLabelText(/departure date and time/i),
      '2026-10-12T14:30',
    );
    await user.clear(screen.getByLabelText(/load weight/i));
    await user.type(screen.getByLabelText(/load weight/i), '20000');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    expect(seen).toEqual(['Phoenix, AZ|Miami, FL']);
  });

  it('ships sensible defaults so only a destination is required', async () => {
    renderWithProviders(
      <RoutePlanForm onSubmit={() => {}} isPending={false} onCancel={() => {}} />,
    );
    expect(screen.getByLabelText(/^origin/i)).toHaveValue('Chicago, IL');
    expect(screen.getByLabelText(/load weight/i)).toHaveValue(30);
    const departure = (
      screen.getByLabelText(/departure date and time/i) as HTMLInputElement
    ).value;
    expect(departure).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(screen.getByLabelText(/^destination/i)).toHaveValue('');
  });
});
