import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';

import { forecastOffsetLabel } from '../../lib/forecast';
import { ForecastSlider } from './ForecastSlider';

interface ForecastSectionProps {
  /** Current forecast offset in hours (0-48). */
  value: number;
  /** Callback when the value changes. */
  onChange: (value: number) => void;
  /** ISO 8601 UTC timestamp for the forecast start (departure time). */
  departureAt: string;
  /** Whether a request is in flight. */
  loading?: boolean;
  /** Error message if the last request failed. */
  error?: string | null;
}

/**
 * Forecast controls as a collapsible bottom-sheet section, collapsed by
 * default so route information stays visible first.
 *
 * The slider lives here — inside the single results surface — never as a
 * floating panel over the route cards. Expanding the section never covers
 * route content because it is part of the sheet flow.
 */
export function ForecastSection({
  value,
  onChange,
  departureAt,
  loading = false,
  error = null,
}: ForecastSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <Accordion
      disableGutters
      expanded={expanded}
      onChange={(_event, isExpanded) => setExpanded(isExpanded)}
      sx={{ borderRadius: 2 }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="forecast-section-content"
        id="forecast-section-header"
      >
        <Box>
          <Typography component="span" variant="subtitle1" fontWeight={700}>
            Forecast
          </Typography>
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            sx={{ ml: 1 }}
          >
            {forecastOffsetLabel(value)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails id="forecast-section-content">
        <ForecastSlider
          value={value}
          onChange={onChange}
          departureAt={departureAt}
          loading={loading}
          error={error}
        />
      </AccordionDetails>
    </Accordion>
  );
}
