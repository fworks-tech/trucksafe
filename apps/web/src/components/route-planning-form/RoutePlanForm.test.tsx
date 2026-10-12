import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RoutePlanForm } from './RoutePlanForm';
import { renderWithProviders } from '../../../test/render';

function renderForm(isPending = false): {
  onSubmit: ReturnType<typeof vi.fn>;
} {
  const onSubmit = vi.fn();
  renderWithProviders(
    <RoutePlanForm onSubmit={onSubmit} isPending={isPending} onCancel={vi.fn()} />,
  );
  return { onSubmit };
}

describe('RoutePlanForm', () => {
  it('renders all required fields with accessible labels', () => {
    renderForm();
    expect(screen.getByLabelText(/origin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/departure date and time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/load weight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/checkpoint interval/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /plan route/i })).toBeInTheDocument();
  });

  it('rejects empty required fields', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    expect(await screen.findByText(/origin is required/i)).toBeInTheDocument();
    expect(screen.getByText(/destination is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects negative load weight client-side', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText(/origin/i), 'Chicago, IL');
    await user.type(screen.getByLabelText(/destination/i), 'Dallas, TX');
    const departure = screen.getByLabelText(/departure date and time/i);
    await user.type(departure, '2026-10-12T14:30');
    await user.type(screen.getByLabelText(/load weight/i), '-5');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    expect(await screen.findByText(/cannot be negative/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects identical origin and destination', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText(/origin/i), 'Chicago, IL');
    await user.type(screen.getByLabelText(/destination/i), '  Chicago, IL ');
    await user.type(
      screen.getByLabelText(/departure date and time/i),
      '2026-10-12T14:30',
    );
    await user.type(screen.getByLabelText(/load weight/i), '1000');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    expect(await screen.findByText(/must be different/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits normalized values for valid input', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText(/origin/i), 'Chicago, IL');
    await user.type(screen.getByLabelText(/destination/i), 'Dallas, TX');
    await user.type(
      screen.getByLabelText(/departure date and time/i),
      '2026-10-12T14:30',
    );
    await user.type(screen.getByLabelText(/load weight/i), '20000');
    await user.click(screen.getByRole('button', { name: /plan route/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      loadWeight: 20000,
      checkpointInterval: 25,
    });
  });

  it('disables submission while a request is in progress', () => {
    renderForm(true);
    expect(screen.getByRole('button', { name: /planning/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
