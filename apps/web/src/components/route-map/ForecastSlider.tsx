import { Alert, Box, Slider, Typography } from '@mui/material';

import {
  computeForecastTime,
  forecastOffsetLabel,
  formatForecastTime,
} from '../../lib/forecast';

interface ForecastSliderProps {
  /** Current forecast offset in hours (0-48). */
  value: number;
  /** Callback when the value changes. */
  onChange: (value: number) => void;
  /** ISO 8601 UTC timestamp for the forecast start (departure time). */
  departureAt: string;
  /** Whether a request is in flight. */
  loading?: boolean;
  /** Whether the slider should be disabled. */
  disabled?: boolean;
  /** Error message if the last request failed. */
  error?: string | null;
}

const MIN_HOURS = 0;
const MAX_HOURS = 48;
const STEP_HOURS = 1;

export function ForecastSlider({
  value,
  onChange,
  departureAt,
  loading = false,
  disabled = false,
  error = null,
}: ForecastSliderProps): React.JSX.Element {
  const forecastTime = computeForecastTime(departureAt, value);
  const formattedTime = formatForecastTime(forecastTime);

  const marks = Array.from({ length: MAX_HOURS / 12 + 1 }, (_, i) => ({
    value: i * 12,
    label: `${i * 12}h`,
  }));

  return (
    <Box component="section" aria-label="Weather forecast slider" sx={{ width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Typography variant="body1" fontWeight={600} gutterBottom>
          Forecast offset
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {forecastOffsetLabel(value)}
        </Typography>
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1 }}
      >
        {formattedTime}
        {loading && ' — Loading…'}
      </Typography>

      <Slider
        value={value}
        onChange={(_event, newValue) => {
          const v = Array.isArray(newValue) ? newValue[0] : newValue;
          if (typeof v === 'number') onChange(v);
        }}
        min={MIN_HOURS}
        max={MAX_HOURS}
        step={STEP_HOURS}
        marks={marks}
        valueLabelDisplay="auto"
        aria-label="Forecast hour offset from departure"
        aria-valuetext={`Forecast offset ${value} hours from departure, ${formattedTime}`}
        disabled={disabled || loading}
        sx={{ width: '100%' }}
      />

      {error && (
        <Alert severity="warning" role="status" sx={{ mt: 1 }}>
          Weather forecast unavailable: {error} Routes below are still current.
        </Alert>
      )}
    </Box>
  );
}
