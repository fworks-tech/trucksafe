import { Alert, AlertTitle, List, ListItem, ListItemText, Stack } from '@mui/material';
import { useState } from 'react';

interface WarningListProps {
  warnings: string[];
}

/** Plan-level degradation notes; renders nothing when there are none. */
export function WarningList({ warnings }: WarningListProps): React.JSX.Element | null {
  // Dismissible to cut sidebar noise; fresh mount per plan resets it.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (warnings.length === 0) return null;
  return (
    <Alert severity="warning" onClose={() => setDismissed(true)}>
      <AlertTitle>
        {warnings.length === 1 ? 'Warning' : `${warnings.length} warnings`}
      </AlertTitle>
      <Stack component={List} disablePadding sx={{ listStyleType: 'disc', pl: 2 }}>
        {warnings.map((warning, index) => (
          <ListItem
            key={`${index}-${warning}`}
            disablePadding
            sx={{ display: 'list-item' }}
          >
            <ListItemText primary={warning} />
          </ListItem>
        ))}
      </Stack>
    </Alert>
  );
}
