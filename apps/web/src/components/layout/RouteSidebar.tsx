import { ExpandMore, DragIndicator } from '@mui/icons-material';
import { Box, IconButton, useMediaQuery } from '@mui/material';
import { useState, type ReactNode } from 'react';

import { theme } from '../../app/theme';

interface RouteSidebarProps {
  children: ReactNode;
}

const sharedSx = {
  borderRadius: 3,
  zIndex: 4,
  bgcolor: 'background.paper',
  boxShadow: 6,
} as const;

/**
 * Floating planning panel. Desktop: a persistent left panel over the map
 * with independent scrolling. Mobile: a bottom sheet that collapses and
 * expands without covering the whole map. Content stays mounted in both
 * modes so selection and form state never reset.
 */
export function RouteSidebar({ children }: RouteSidebarProps): React.JSX.Element {
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [expanded, setExpanded] = useState(true);

  if (isDesktop) {
    return (
      <Box
        component="aside"
        aria-label="Route planning panel"
        sx={{
          ...sharedSx,
          position: 'absolute',
          top: 16,
          left: 16,
          bottom: 16,
          width: 384,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          p: 2,
        }}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box
      component="aside"
      aria-label="Route planning panel"
      sx={{
        ...sharedSx,
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: '16px 16px 0 0',
        maxHeight: expanded ? '75vh' : 132,
        overflowY: expanded ? 'auto' : 'hidden',
        overscrollBehavior: 'contain',
        transition: 'max-height 200ms ease',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          display: 'flex',
          justifyContent: 'center',
          bgcolor: 'inherit',
          zIndex: 1,
        }}
      >
        <IconButton
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
          size="small"
          sx={{ minHeight: 44 }}
        >
          {expanded ? <ExpandMore /> : <DragIndicator />}
        </IconButton>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Box>
  );
}
