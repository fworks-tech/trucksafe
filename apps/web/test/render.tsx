import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { theme } from '../src/app/theme';

/** Render UI with the same providers the production shell uses.
 *
 * Providers go through RTL's `wrapper` option (not baked into the
 * element) so `rerender` keeps them mounted and preserves component
 * identity instead of silently remounting the tree.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper' | 'queries'>,
): RenderResult {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Providers({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <QueryClientProvider client={client}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { ...options, wrapper: Providers });
}
