import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';
import { renderWithProviders } from '../../test/render';

function Exploding(): React.JSX.Element {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders a safe fallback without stack traces', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(
        <ErrorBoundary>
          <Exploding />
        </ErrorBoundary>,
      );
    } finally {
      spy.mockRestore();
    }
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/could not display this page/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('boom');
  });
});
