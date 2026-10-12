import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button, Container, Stack, Typography } from '@mui/material';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Last-resort shell for unexpected rendering errors. Never leaks stacks. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Diagnostic-only: component stack is not rendered to users.
    if (import.meta.env['DEV']) {
      console.error('Uncaught render error', error, info.componentStack);
    }
  }

  private handleReload = (): void => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Stack spacing={2} role="alert">
            <Typography variant="h1">Something went wrong</Typography>
            <Alert severity="error">
              We could not display this page. Please try again.
            </Alert>
            <Button
              variant="contained"
              onClick={this.handleReload}
              sx={{ alignSelf: 'flex-start' }}
            >
              Reload the page
            </Button>
          </Stack>
        </Container>
      );
    }
    return this.props.children;
  }
}
