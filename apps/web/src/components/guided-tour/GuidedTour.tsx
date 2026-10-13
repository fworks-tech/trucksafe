import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, IconButton, Typography, useMediaQuery } from '@mui/material';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { theme } from '../../app/theme';
import { writeTourState } from './storage';
import { buildTourSteps } from './tourSteps';

interface GuidedTourProps {
  /** A generated plan exists; result steps show real targets. */
  hasResults: boolean;
  /** Current plan uses demonstration geometry (mock provider). */
  mockMode: boolean;
  /** Explicit example-trip action: fills Chicago to Dallas and submits. */
  onUseExample: () => void;
  /** Closes the tour; completion is persisted before this fires. */
  onClose: () => void;
}

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const RING_PAD = 8;
const DIALOG_WIDTH = 340;
const VIEWPORT_MARGIN = 12;

/** Viewport-relative rect of the anchor, or null when it is missing. */
function measureTarget(anchor: string | null): TargetRect | null {
  if (anchor === null) return null;
  const element = document.querySelector(`[data-tour="${anchor}"]`);
  if (!(element instanceof HTMLElement) || !element.isConnected) return null;
  const rect = element.getBoundingClientRect();
  // jsdom (and display:none ancestors) report zero rects: treat the
  // target as missing so the step falls back to a centered dialog.
  if (rect.width < 2 || rect.height < 2) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * Interactive product tour: dimmed backdrop, spotlight ring on the
 * current target, and an explanatory dialog with Previous/Next/Skip.
 *
 * The target rect is re-measured on a short interval while open, so tab
 * switches, sheet snaps, and panel scrolls never leave the ring behind.
 * No transitions are used and scrolling is instant, so there is nothing
 * to disable for reduced-motion users.
 */
export function GuidedTour({
  hasResults,
  mockMode,
  onUseExample,
  onClose,
}: GuidedTourProps): React.JSX.Element {
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const steps = useMemo(
    () => buildTourSteps({ hasResults, mockMode }),
    [hasResults, mockMode],
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const restoreFocusRef = useRef<Element | null>(null);

  const clamped = Math.min(Math.max(index, 0), steps.length - 1);
  const step = steps[clamped]!;
  const fallback = step.requiresResults && !hasResults;
  const isFirst = clamped === 0;
  const isLast = clamped === steps.length - 1;

  const refreshRect = (anchor: string | null): void => {
    const element =
      anchor === null ? null : document.querySelector(`[data-tour="${anchor}"]`);
    if (element instanceof HTMLElement && element.isConnected) {
      try {
        if (typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      } catch {
        // jsdom and overflow edge cases: spotlight still positions below.
      }
    }
    setRect(measureTarget(anchor));
  };

  // Remember the trigger for focus restore; re-measure continuously so
  // the ring tracks scrolling, tab switches, and sheet movement.
  useLayoutEffect(() => {
    restoreFocusRef.current = document.activeElement;
    refreshRect(step.target);
    const timer = window.setInterval(() => {
      setRect(measureTarget(step.target));
    }, 250);
    return (): void => {
      window.clearInterval(timer);
    };
    // Re-scroll on step changes only; the interval handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, hasResults]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [clamped]);

  useEffect(() => {
    return (): void => {
      // Restore focus to whatever opened the tour.
      if (restoreFocusRef.current instanceof HTMLElement) {
        restoreFocusRef.current.focus();
      }
    };
  }, []);

  const exit = (persist: boolean): void => {
    if (persist) writeTourState('completed');
    onClose();
  };

  // Escape exits; Tab cycles inside the dialog so keyboard users never
  // get lost behind the backdrop.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        exit(true);
        return;
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (delta: number): void => {
    setIndex(Math.min(Math.max(clamped + delta, 0), steps.length - 1));
  };

  // Desktop: adjacent to the target with edge clamping, centered when
  // there is no room or no target. Mobile: bottom-docked card that never
  // leaves the viewport and respects the safe area.
  const dialogSx = ((): Record<string, unknown> => {
    const base = {
      position: 'fixed',
      zIndex: 1302,
      width: isDesktop ? DIALOG_WIDTH : undefined,
      left: isDesktop ? undefined : 12,
      right: isDesktop ? undefined : 12,
      bottom: isDesktop ? undefined : 'calc(12px + env(safe-area-inset-bottom))',
      maxHeight: isDesktop ? 'min(70vh, 560px)' : '46dvh',
      overflowY: 'auto',
      bgcolor: 'background.paper',
      borderRadius: 2,
      boxShadow: 8,
      p: 2,
    } as Record<string, unknown>;
    if (!isDesktop || rect === null) {
      if (!isDesktop) return base;
      return {
        ...base,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rightX = rect.x + rect.width + 16;
    if (rightX + DIALOG_WIDTH <= vw - VIEWPORT_MARGIN) {
      return { ...base, left: Math.max(rightX, VIEWPORT_MARGIN), top: 64 };
    }
    const leftX = rect.x - DIALOG_WIDTH - 16;
    if (leftX >= VIEWPORT_MARGIN) {
      return { ...base, left: leftX, top: 64 };
    }
    return {
      ...base,
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.x, vw - DIALOG_WIDTH - VIEWPORT_MARGIN),
      ),
      top: Math.min(rect.y + rect.height + 16, vh - 200),
    };
  })();

  return (
    <>
      <Box
        aria-hidden="true"
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1300,
          backgroundColor: 'rgba(8, 15, 30, 0.68)',
          // Click-through: the dialog guides, but the app stays usable —
          // the tour itself asks users to expand sections and tabs.
          pointerEvents: 'none',
        }}
      />
      {rect !== null && (
        <Box
          aria-hidden="true"
          data-testid="tour-spotlight"
          sx={{
            position: 'fixed',
            zIndex: 1301,
            left: Math.max(rect.x - RING_PAD, 4),
            top: Math.max(rect.y - RING_PAD, 4),
            width: rect.width + RING_PAD * 2,
            height: rect.height + RING_PAD * 2,
            border: '2px solid #ffffff',
            borderRadius: 3,
            boxShadow: '0 0 0 4px rgba(28, 70, 102, 0.9), 0 0 24px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
          }}
        />
      )}
      <Box
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        aria-describedby="guided-tour-body"
        sx={dialogSx}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" aria-hidden="true">
            Step {clamped + 1} of {steps.length}
          </Typography>
          <IconButton
            type="button"
            size="small"
            aria-label="Close tour"
            onClick={() => exit(true)}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box
          role="progressbar"
          aria-label="Tour progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={clamped + 1}
          sx={{
            height: 4,
            borderRadius: 2,
            backgroundColor: 'divider',
            mb: 1.5,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${((clamped + 1) / steps.length) * 100}%`,
              backgroundColor: 'primary.main',
            }}
          />
        </Box>
        <Typography
          id="guided-tour-title"
          ref={titleRef}
          tabIndex={-1}
          variant="h2"
          component="h2"
          sx={{ '&:focus': { outline: 'none' } }}
        >
          {step.title}
        </Typography>
        <Typography id="guided-tour-body" variant="body2" sx={{ mt: 0.5, mb: 2 }}>
          {fallback
            ? `${step.body} No route results yet — use the example trip below, or go back and press Plan route yourself.`
            : step.body}
        </Typography>
        {(step.offerExample || fallback) && (
          <Button
            type="button"
            variant="outlined"
            size="small"
            onClick={onUseExample}
            sx={{ mb: 1.5 }}
          >
            Use example trip
          </Button>
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Button type="button" size="small" onClick={() => exit(true)}>
            {isLast ? 'Exit tour' : 'Skip tour'}
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!isFirst && (
              <Button type="button" size="small" onClick={() => go(-1)}>
                Previous
              </Button>
            )}
            {isLast ? (
              <>
                <Button type="button" size="small" onClick={() => setIndex(0)}>
                  Restart tour
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="contained"
                  onClick={() => exit(true)}
                >
                  Finish tour
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="small"
                variant="contained"
                onClick={() => go(1)}
              >
                Next
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
}
