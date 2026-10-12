/** TanStack Query mutation for route-plan creation.
 *
 * Server state only: idle until submission, no retries (the POST is not
 * idempotent from the client's perspective), abortable via the signal
 * returned by the hook. Stale results are cleared explicitly by the page
 * before each submission; nothing is persisted to storage.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { RoutePlanResponse } from '../types';
import { createRoutePlan, type CreateRoutePlanResult } from '../api/client';
import { RoutePlanApiError } from '../api/errors';
import type { NormalizedRoutePlanInput } from '../schemas';

export interface RoutePlanMutationInput {
  input: NormalizedRoutePlanInput;
  signal?: AbortSignal;
  requestId?: string;
}

export type RoutePlanMutation = UseMutationResult<
  CreateRoutePlanResult,
  RoutePlanApiError,
  RoutePlanMutationInput
>;

export function useRoutePlanMutation(): RoutePlanMutation {
  return useMutation<CreateRoutePlanResult, RoutePlanApiError, RoutePlanMutationInput>({
    mutationFn: ({ input, signal, requestId }) =>
      createRoutePlan(
        {
          origin: { address: input.origin },
          destination: { address: input.destination },
          departure_at: input.departure_at,
          load_weight_lb: input.load_weight_lb,
          checkpoint_interval_miles: input.checkpoint_interval_miles,
        },
        { signal, requestId },
      ),
    // The backend treats repeats as idempotent reads, but the client must
    // not fire duplicate POSTs on its own (double submit, remount, focus).
    retry: false,
  });
}

export type { RoutePlanResponse };
