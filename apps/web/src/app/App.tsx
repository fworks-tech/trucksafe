import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Container, CssBaseline, ThemeProvider, Typography } from '@mui/material';
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
        <ErrorBoundary>
          <Container maxWidth="lg" component="main" sx={{ py: { xs: 3, md: 5 } }}>
            <Typography variant="h1" component="h1" gutterBottom>
              TruckSafe Route Planner
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Plan a truck route and compare weather-risk alternatives. Results use
              deterministic demonstration data, not live weather.
            </Typography>
            <RoutePlanPage />
          </Container>
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
