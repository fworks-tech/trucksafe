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
    await user.click(screen.getByRole('button', { name: /phoenix, az to denver, co/i }));
    expect(screen.getByLabelText(/^origin/i)).toHaveValue('Phoenix, AZ');
    await user.clear(screen.getByLabelText(/^destination/i));
    await user.type(screen.getByLabelText(/^destination/i), 'Miami, FL');
    await user.type(
      screen.getByLabelText(/departure date and time/i),
      '2026-10-12T14:30',
    );
    await user.type(screen.getByLabelText(/load weight/i), '20000');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    expect(seen).toEqual(['Phoenix, AZ|Miami, FL']);
  });
});
