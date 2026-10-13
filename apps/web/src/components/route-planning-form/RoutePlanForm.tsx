import { zodResolver } from '@hookform/resolvers/zod';
import { Flag, MyLocation, Scale, Schedule } from '@mui/icons-material';
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

import { US_CITIES, DEFAULT_ORIGIN_CITY } from '../../features/route-planning/cities';
import {
  routePlanFormSchema,
  type RoutePlanFormValues,
} from '../../features/route-planning/schemas';
import { CHECKPOINT_INTERVALS } from '../../features/route-planning/types';
import { toLocalInputValue } from '../../lib/datetime';

/** Accessible quick examples: they only prefill addresses, never submit. */
const QUICK_EXAMPLES = [
  { origin: 'Chicago, IL', destination: 'Dallas, TX' },
  { origin: 'Phoenix, AZ', destination: 'Denver, CO' },
] as const;

interface RoutePlanFormProps {
  onSubmit: (values: RoutePlanFormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  /** Fires when the origin text changes so the background map can follow. */
  onOriginChange?: (city: string) => void;
}

/** Route-plan input form. Client validation improves UX; backend is final. */
export function RoutePlanForm({
  onSubmit,
  isPending,
  onCancel,
  onOriginChange,
}: RoutePlanFormProps): React.JSX.Element {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RoutePlanFormValues>({
    resolver: zodResolver(routePlanFormSchema),
    // Sensible starting point: Chicago today with a light load; the user
    // only needs a destination to plan.
    defaultValues: {
      origin: DEFAULT_ORIGIN_CITY,
      destination: '',
      departure: toLocalInputValue(new Date()),
      loadWeight: 30,
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
              if (name === 'origin') onOriginChange?.(value);
            }}
            onChange={(_event, value) => {
              const next = typeof value === 'string' ? value : '';
              setText(next);
              field.onChange(next);
              if (name === 'origin') onOriginChange?.(next);
            }}
            onBlur={field.onBlur}
            disabled={isPending}
            renderInput={(params) => (
              <TextField
                {...params}
                id={name}
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
                  notifyOrigin(example.origin);
                  setDestinationText(example.destination);
                }}
                label={`${example.origin} to ${example.destination}`}
                sx={{
                  flex: '1 1 calc(50% - 4px)',
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
        <TextField
          id="departure"
          label="Departure date and time"
          type="datetime-local"
          disabled={isPending}
          error={errors.departure !== undefined}
          helperText={errors.departure?.message ?? 'Interpreted in your local timezone.'}
          slotProps={{ inputLabel: { shrink: true } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Schedule fontSize="small" />
              </InputAdornment>
            ),
          }}
          {...register('departure')}
        />
        <TextField
          id="loadWeight"
          label="Load weight (lb)"
          type="number"
          disabled={isPending}
          error={errors.loadWeight !== undefined}
          helperText={errors.loadWeight?.message}
          slotProps={{ htmlInput: { min: 0, step: 'any' } }}
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
          <Button type="submit" variant="contained" disabled={isPending}>
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
