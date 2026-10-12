/** Route-plan form schema (client-side UX validation only).
 *
 * The backend remains authoritative. This schema mirrors the backend rules
 * that can be checked locally so users get immediate feedback; every rule
 * here is re-validated server-side.
 */

import { z } from 'zod';

import { toUtcIso } from '../../lib/datetime';
import { CHECKPOINT_INTERVALS, type CheckpointInterval } from './types';

const nonEmptyText = (label: string): z.ZodString =>
  z.string().trim().min(1, `${label} is required.`);

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
};

export const routePlanFormSchema = z
  .object({
    origin: nonEmptyText('Origin'),
    destination: nonEmptyText('Destination'),
    departure: z
      .string()
      .min(1, 'Departure date and time is required.')
      .refine(
        (value) => toUtcIso(value) !== null,
        'Enter a valid departure date and time.',
      ),
    loadWeight: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number({
          required_error: 'Load weight is required.',
          invalid_type_error: 'Load weight must be a number.',
        })
        .finite('Load weight must be a finite number.')
        .min(0, 'Load weight cannot be negative.'),
    ),
    checkpointInterval: z.coerce
      .number()
      .refine(
        (value): value is CheckpointInterval =>
          (CHECKPOINT_INTERVALS as readonly number[]).includes(value),
        'Checkpoint interval must be 10, 25, or 50 miles.',
      ),
  })
  .refine((data) => data.origin !== data.destination, {
    message: 'Origin and destination must be different.',
    path: ['destination'],
  });

export type RoutePlanFormValues = z.infer<typeof routePlanFormSchema>;

export interface NormalizedRoutePlanInput {
  origin: string;
  destination: string;
  /** Explicit UTC ISO 8601 timestamp. */
  departure_at: string;
  load_weight_lb: number;
  checkpoint_interval_miles: CheckpointInterval;
}

/** Normalize validated form values into the API request shape. */
export function normalizeFormValues(
  values: RoutePlanFormValues,
): NormalizedRoutePlanInput {
  const departureAt = toUtcIso(values.departure);
  if (departureAt === null) {
    // Unreachable for schema-validated values; the schema already refines
    // departure through the same conversion.
    throw new Error('Departure could not be converted to UTC.');
  }
  return {
    origin: values.origin,
    destination: values.destination,
    departure_at: departureAt,
    load_weight_lb: values.loadWeight,
    checkpoint_interval_miles: values.checkpointInterval,
  };
}
