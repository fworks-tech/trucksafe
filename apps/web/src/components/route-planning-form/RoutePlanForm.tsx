import { zodResolver } from '@hookform/resolvers/zod';
import Flag from '@mui/icons-material/Flag';
import MyLocation from '@mui/icons-material/MyLocation';
import Scale from '@mui/icons-material/Scale';
import Schedule from '@mui/icons-material/Schedule';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

import { US_CITIES, DEFAULT_ORIGIN_CITY } from '../../features/route-planning/cities';
import {
  routePlanFormSchema,
  type RoutePlanFormValues,
} from '../../features/route-planning/schemas';
import { CHECKPOINT_INTERVALS } from '../../features/route-planning/types';
import { toLocalDate, toLocalInputValue } from '../../lib/datetime';

/** Accessible quick examples: they only prefill addresses, never submit.
 * Short labels keep two chips per row; the full pair stays in aria-label.
 */
const QUICK_EXAMPLES = [
  { origin: 'Chicago, IL', destination: 'Dallas, TX', short: 'Chicago → Dallas' },
  { origin: 'Phoenix, AZ', destination: 'Denver, CO', short: 'Phoenix → Denver' },
] as const;

interface RoutePlanFormProps {
  onSubmit: (values: RoutePlanFormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  /** Fires when the origin text changes so the background map can follow. */
  onOriginChange?: (city: string) => void;
  /** Fires when the destination text changes so the background map can follow. */
  onDestinationChange?: (city: string) => void;
}

/** Route-plan input form. Client validation improves UX; backend is final. */
export function RoutePlanForm({
  onSubmit,
  isPending,
  onCancel,
  onOriginChange,
  onDestinationChange,
}: RoutePlanFormProps): React.JSX.Element {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RoutePlanFormValues>({
    resolver: zodResolver(routePlanFormSchema),
    // Sensible starting point: Chicago today with a typical loaded
    // weight in pounds; the user only needs a destination to plan.
    defaultValues: {
      origin: DEFAULT_ORIGIN_CITY,
      destination: '',
      departure: toLocalInputValue(new Date()),
      loadWeight: 30000,
      checkpointInterval: 25,
    },
  });
  // Mirror of the typed text: RHF only commits freeSolo text on blur or
  // option pick, but keystrokes must stay visible while typing.
  const [originText, setOriginText] = useState(DEFAULT_ORIGIN_CITY);
  const [destinationText, setDestinationText] = useState('');

  const notifyOrigin = (city: string): void => {
    setOriginText(city);
    onOriginChange?.(city);
  };

  const notifyDestination = (city: string): void => {
    setDestinationText(city);
    onDestinationChange?.(city);
  };

  /** City input with suggestions; free text stays allowed for real geocoding. */
  function cityField(
    name: 'origin' | 'destination',
    label: string,
    placeholder: string,
    icon: React.ReactNode,
    text: string,
    setText: (value: string) => void,
  ): React.JSX.Element {
    const fieldError = errors[name]?.message;
    // Both endpoint fields steer the pre-plan background map.
    const notifyMap = name === 'origin' ? onOriginChange : onDestinationChange;
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Autocomplete
            freeSolo
            autoHighlight
            options={US_CITIES}
            inputValue={text}
            onInputChange={(_event, value) => {
              setText(value);
              field.onChange(value);
              notifyMap?.(value);
            }}
            onChange={(_event, value) => {
              const next = typeof value === 'string' ? value : '';
              setText(next);
              field.onChange(next);
              notifyMap?.(next);
            }}
            onBlur={field.onBlur}
            disabled={isPending}
            renderInput={(params) => (
              <TextField
                {...params}
                id={name}
                data-tour={name === 'origin' ? 'origin-input' : 'destination-input'}
                label={label}
                placeholder={placeholder}
                autoComplete="off"
                error={fieldError !== undefined}
                helperText={fieldError}
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">{icon}</InputAdornment>
                  ),
                }}
              />
            )}
          />
        )}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Route plan form">
      <Stack spacing={2}>
        <Box role="group" aria-label="Quick examples">
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Quick examples
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', pt: 0.5 }}>
            {QUICK_EXAMPLES.map((example) => (
              <Chip
                key={example.origin}
                size="small"
                variant="outlined"
                color="primary"
                clickable
                disabled={isPending}
                onClick={() => {
                  setValue('origin', example.origin);
                  setValue('destination', example.destination);
                  // Destination notifies last so the map lands on it.
                  notifyOrigin(example.origin);
                  notifyDestination(example.destination);
                }}
                label={example.short}
                aria-label={`Use example: ${example.origin} to ${example.destination}`}
                sx={{
                  flex: '1 1 calc(50% - 4px)',
                  minWidth: 0,
                  justifyContent: 'center',
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                }}
              />
            ))}
          </Stack>
        </Box>
        {cityField(
          'origin',
          'Origin',
          'Chicago, IL',
          <MyLocation fontSize="small" />,
          originText,
          setOriginText,
        )}
        {cityField(
          'destination',
          'Destination',
          'Dallas, TX',
          <Flag fontSize="small" />,
          destinationText,
          setDestinationText,
        )}
        {/* Themed picker dialog (palette-driven); the native
            datetime-local popup cannot be styled and overflows the panel. */}
        <Controller
          name="departure"
          control={control}
          render={({ field }) => (
            <Box data-tour="departure-input">
              <DateTimePicker
                label="Departure date and time"
                value={toLocalDate(field.value)}
                onChange={(date) => {
                  field.onChange(
                    date instanceof Date && !Number.isNaN(date.getTime())
                      ? toLocalInputValue(date)
                      : '',
                  );
                }}
                ampm={false}
                format="dd/MM/yyyy HH:mm"
                disabled={isPending}
                slotProps={{
                  textField: {
                    id: 'departure',
                    fullWidth: true,
                    error: errors.departure !== undefined,
                    helperText:
                      errors.departure?.message ?? 'Interpreted in your local timezone.',
                    onBlur: field.onBlur,
                    InputProps: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Schedule fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  },
                }}
              />
            </Box>
          )}
        />
        <TextField
          id="loadWeight"
          data-tour="load-weight-input"
          label="Load weight (lb)"
          type="number"
          disabled={isPending}
          error={errors.loadWeight !== undefined}
          helperText={errors.loadWeight?.message}
          slotProps={{ htmlInput: { min: 0, step: 'any', placeholder: '30000' } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Scale fontSize="small" />
              </InputAdornment>
            ),
          }}
          {...register('loadWeight', { valueAsNumber: true })}
        />
        <FormControl
          fullWidth
          data-tour="checkpoint-interval"
          disabled={isPending}
          error={errors.checkpointInterval !== undefined}
        >
          <InputLabel id="checkpoint-interval-label">Checkpoint interval</InputLabel>
          <Controller
            name="checkpointInterval"
            control={control}
            render={({ field }) => (
              <Select
                id="checkpointInterval"
                labelId="checkpoint-interval-label"
                label="Checkpoint interval"
                {...field}
              >
                {CHECKPOINT_INTERVALS.map((interval) => (
                  <MenuItem key={interval} value={interval}>
                    Every {interval} miles
                  </MenuItem>
                ))}
              </Select>
            )}
          />
          {errors.checkpointInterval !== undefined && (
            <FormHelperText>{errors.checkpointInterval.message}</FormHelperText>
          )}
        </FormControl>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            type="submit"
            variant="contained"
            data-tour="generate-route"
            disabled={isPending}
          >
            {isPending ? 'Planning…' : 'Plan route'}
          </Button>
          {isPending && (
            <Button type="button" variant="outlined" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      </Stack>
    </form>
  );
}
