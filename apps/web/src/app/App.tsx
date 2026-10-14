import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { useState } from 'react';

import { RoutePlanPage } from '../components/route-plan-page/RoutePlanPage';
import { ErrorBoundary } from './ErrorBoundary';
import { theme } from './theme';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function App(): React.JSX.Element {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {/* Themed date/time picker dialogs (the native control cannot
            use the palette) for the departure field. */}
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <ErrorBoundary>
            {/* Map-first shell: one fixed viewport-height layer. The map
              fills it; the planning panel floats above it. */}
            <Box
              component="main"
              sx={{
                position: 'fixed',
                inset: 0,
                overflow: 'hidden',
                bgcolor: 'background.default',
              }}
            >
              <RoutePlanPage />
            </Box>
          </ErrorBoundary>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
