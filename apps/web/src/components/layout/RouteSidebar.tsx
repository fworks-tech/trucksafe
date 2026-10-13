import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import UnfoldMore from '@mui/icons-material/UnfoldMore';
import { Box, IconButton, useMediaQuery } from '@mui/material';
import { useState, type ReactNode } from 'react';

import { theme } from '../../app/theme';

interface RouteSidebarProps {
  /** Persistent header (tabs); always visible, including when collapsed. */
  header: ReactNode;
  /** Sheet body; hidden on mobile while collapsed. */
  children: ReactNode;
}

const sharedSx = {
  borderRadius: 3,
  zIndex: 4,
  bgcolor: 'background.paper',
  boxShadow: 6,
} as const;

type MobileSnap = 0 | 1 | 2;

const SNAP_LABELS: Record<MobileSnap, string> = {
  0: 'Expand panel to half height',
  1: 'Expand panel to full height',
  2: 'Collapse panel',
};

const SNAP_ICONS = [UnfoldMore, ExpandMore, ExpandLess] as const;

/**
 * Floating planning panel. Desktop: a persistent left panel over the map
 * with independent scrolling. Mobile: a bottom sheet with collapsed,
 * half, and expanded snap points.
 *
 * Collapsed shows only the grabber and the header (tabs), so nothing is
 * ever clipped mid-content. Half (~55dvh) fits the route overview;
 * expanded (~92dvh) fits details and forecast. A cycling snap button is
 * the drag-free alternative, so keyboard and switch users get every
 * state. Content stays mounted in both modes so selection and form
 * state never reset.
 */
export function RouteSidebar({ header, children }: RouteSidebarProps): React.JSX.Element {
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [snap, setSnap] = useState<MobileSnap>(1);

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
          width: 384,
          // Hug the content instead of stretching full height: short
          // states (e.g. the plan form) leave map visible below the panel
          // instead of an empty box. Tall results still cap at the
          // viewport and scroll inside.
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          p: 2,
        }}
      >
        {header}
        {children}
      </Box>
    );
  }

  const SnapIcon = SNAP_ICONS[snap];
  const collapsed = snap === 0;

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
        maxHeight: collapsed ? 'none' : snap === 1 ? '55dvh' : 'min(92dvh, 780px)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: collapsed ? 'hidden' : 'auto',
        overscrollBehavior: 'contain',
        transition: 'max-height 200ms ease',
        pb: 'calc(8px + env(safe-area-inset-bottom))',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          bgcolor: 'inherit',
          zIndex: 1,
          borderRadius: '16px 16px 0 0',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <IconButton
            onClick={() => setSnap(((snap + 1) % 3) as MobileSnap)}
            aria-expanded={!collapsed}
            aria-label={SNAP_LABELS[snap]}
            size="small"
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            <SnapIcon />
          </IconButton>
        </Box>
        {header}
      </Box>
      {!collapsed && <Box sx={{ px: 2, pb: 1 }}>{children}</Box>}
    </Box>
  );
}
