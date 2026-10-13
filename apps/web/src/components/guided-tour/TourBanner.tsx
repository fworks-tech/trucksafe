import CloseIcon from '@mui/icons-material/Close';
import ExploreIcon from '@mui/icons-material/Explore';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useState } from 'react';

import { readTourState, writeTourState } from './storage';

interface TourBannerProps {
  /** Starts the guided tour. */
  onStart: () => void;
  /** Bump to re-read persisted state after the tour closes. */
  refreshToken: number;
}

/**
 * Tour entry point below the intro text. Full banner on first visit;
 * a compact restart button once dismissed or completed. Never modal,
 * never autoplayed, never blocking.
 */
export function TourBanner({
  onStart,
  refreshToken,
}: TourBannerProps): React.JSX.Element {
  // Session-only: hides the full banner immediately; persistence makes
  // the compact form survive reloads.
  const [dismissed, setDismissed] = useState(false);
  // Re-read on every render so a parent refreshToken bump picks up the
  // persisted state without an effect.
  void refreshToken;
  const persisted = readTourState();

  if (dismissed || persisted !== null) {
    return (
      <Box sx={{ mb: 2 }}>
        <Button
          type="button"
          variant="text"
          size="small"
          startIcon={<ExploreIcon fontSize="small" />}
          onClick={onStart}
          aria-label="Restart the guided tour"
        >
          Take the guided tour
        </Button>
      </Box>
    );
  }

  const handleDismiss = (): void => {
    writeTourState('dismissed');
    setDismissed(true);
  };

  return (
    <Box
      component="section"
      aria-labelledby="tour-banner-title"
      data-tour="tour-banner"
      sx={{
        mb: 2,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.default',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography
          id="tour-banner-title"
          variant="subtitle1"
          component="p"
          fontWeight={700}
          sx={{ m: 0 }}
        >
          Explore TruckSafe
        </Typography>
        <IconButton
          type="button"
          size="small"
          aria-label="Dismiss tour banner"
          onClick={handleDismiss}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Take an interactive tour to see how TruckSafe plans routes, evaluates weather
        risk, and recommends the safest option.
      </Typography>
      <Button
        type="button"
        variant="contained"
        size="small"
        startIcon={<ExploreIcon fontSize="small" />}
        onClick={onStart}
      >
        Start guided tour
      </Button>
    </Box>
  );
}
