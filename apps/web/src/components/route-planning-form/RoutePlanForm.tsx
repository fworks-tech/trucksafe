import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';

import {
  routePlanFormSchema,
  type RoutePlanFormValues,
} from '../../features/route-planning/schemas';
import { CHECKPOINT_INTERVALS } from '../../features/route-planning/types';

interface RoutePlanFormProps {
  onSubmit: (values: RoutePlanFormValues) => void;
  isPending: boolean;
  onCancel: () => void;
}

/** Route-plan input form. Client validation improves UX; backend is final. */
export function RoutePlanForm({
  onSubmit,
  isPending,
  onCancel,
}: RoutePlanFormProps): React.JSX.Element {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RoutePlanFormValues>({
    resolver: zodResolver(routePlanFormSchema),
    defaultValues: {
      origin: '',
      destination: '',
      departure: '',
      checkpointInterval: 25,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Route plan form">
      <Stack spacing={2}>
        <TextField
          id="origin"
          label="Origin"
          placeholder="Chicago, IL"
          autoComplete="off"
          disabled={isPending}
          error={errors.origin !== undefined}
          helperText={errors.origin?.message}
          {...register('origin')}
        />
        <TextField
          id="destination"
          label="Destination"
          placeholder="Dallas, TX"
          autoComplete="off"
          disabled={isPending}
          error={errors.destination !== undefined}
          helperText={errors.destination?.message}
          {...register('destination')}
        />
        <TextField
          id="departure"
          label="Departure date and time"
          type="datetime-local"
          disabled={isPending}
          error={errors.departure !== undefined}
          helperText={errors.departure?.message ?? 'Interpreted in your local timezone.'}
          slotProps={{ inputLabel: { shrink: true } }}
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
