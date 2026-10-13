/** Centralized Material UI theme and semantic risk tokens.
 *
 * All color decisions live here. Components reference `riskTokens` or the
 * MUI palette; no color constants are scattered through components. Every
 * risk indicator pairs its color with visible text, so color is never the
 * only signal.
 */

import { createTheme } from '@mui/material/styles';

export interface RiskToken {
  background: string;
  text: string;
  border: string;
}

export const riskTokens: Record<
  'low' | 'moderate' | 'high' | 'severe' | 'noTravel' | 'unavailable',
  RiskToken
> = {
  low: { background: '#e6f4ea', text: '#1b5e20', border: '#a3d9b1' },
  moderate: { background: '#fef6d8', text: '#7a5c00', border: '#eed88a' },
  high: { background: '#fdeedd', text: '#8a3c00', border: '#f5c08a' },
  severe: { background: '#fde7e9', text: '#a31226', border: '#f3a8b2' },
  noTravel: { background: '#5c0a14', text: '#ffffff', border: '#5c0a14' },
  unavailable: { background: '#eceff1', text: '#455a64', border: '#b0bec5' },
};

export const statusTokens = {
  eligible: { background: '#e6f4ea', text: '#1b5e20', border: '#a3d9b1' },
  ineligible: { background: '#fde7e9', text: '#a31226', border: '#f3a8b2' },
  recommended: { background: '#e3f2fd', text: '#0d47a1', border: '#90caf9' },
} satisfies Record<string, RiskToken>;

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0d47a1' },
    secondary: { main: '#455a64' },
    background: { default: '#f5f7fa', paper: '#ffffff' },
    text: { primary: '#1a2332', secondary: '#455a64' },
    warning: { main: '#8a3c00' },
    error: { main: '#a31226' },
    success: { main: '#1b5e20' },
    divider: '#cfd8dc',
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    h1: { fontSize: '1.75rem', fontWeight: 700 },
    h2: { fontSize: '1.25rem', fontWeight: 700 },
    h3: { fontSize: '1.05rem', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Visible focus indicator everywhere; MUI outlines alone can be
        // subtle against custom backgrounds.
        '*:focus-visible': {
          outline: '3px solid #0d47a1',
          outlineOffset: '2px',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            transitionDuration: '0.01ms !important',
          },
        },
        // Subtle thin scrollbars; scrolling and focus stay native so
        // keyboard and assistive-tech behavior is untouched.
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: '#b0bec5 transparent',
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-thumb': {
          background: '#b0bec5',
          borderRadius: 4,
        },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, minHeight: 48 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', fullWidth: true },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: '1px solid #cfd8dc' },
      },
    },
  },
});
