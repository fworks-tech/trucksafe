import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  RoutePlanApiError,
  USER_MESSAGES,
  type ApiErrorCategory,
} from '../../features/route-planning/api/errors';
import { ErrorState } from './ErrorState';
import { RequestStatus } from './RequestStatus';
import { renderWithProviders } from '../../../test/render';

function errorFor(category: ApiErrorCategory): RoutePlanApiError {
  return new RoutePlanApiError({
    category,
    status: 400,
    requestId: 'diag-1',
    backendCode: 'INVALID_REQUEST',
    backendMessage: 'origin: blank',
  });
}

describe('ErrorState', () => {
  it('renders the fixed safe message for every category', () => {
    const categories: ApiErrorCategory[] = [
      'validation',
      'domain',
      'provider',
      'unavailable',
      'network',
      'malformed',
      'unexpected',
    ];
    for (const category of categories) {
      const { unmount } = renderWithProviders(<ErrorState error={errorFor(category)} />);
      expect(screen.getByText(USER_MESSAGES[category])).toBeInTheDocument();
      unmount();
    }
  });

  it('exposes the request id without stack traces or internals', () => {
    const { container } = renderWithProviders(
      <ErrorState error={errorFor('validation')} />,
    );
    expect(screen.getByText(/diag-1/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Traceback|File "\/|node_modules/);
  });
});

describe('RequestStatus', () => {
  it('announces loading, success, and error states', () => {
    const { unmount } = renderWithProviders(<RequestStatus state="pending" />);
    expect(screen.getByText(/creating your route plan/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    unmount();

    renderWithProviders(<RequestStatus state="success" routeCount={3} />);
    expect(screen.getByText(/route plan ready with 3 alternatives/i)).toBeInTheDocument();
  });

  it('dismisses the success note on close', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RequestStatus state="success" routeCount={3} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/route plan ready/i)).not.toBeInTheDocument();
  });
});
