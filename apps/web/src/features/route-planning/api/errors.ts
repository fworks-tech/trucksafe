/** Typed error model for route-plan API failures.
 *
 * Every failure maps to one category with a fixed, user-safe message.
 * Backend envelope messages are kept for collapsed diagnostics only and are
 * never rendered as the primary message.
 */

export type ApiErrorCategory =
  | 'validation'
  | 'domain'
  | 'provider'
  | 'unavailable'
  | 'network'
  | 'malformed'
  | 'aborted'
  | 'unexpected';

export const USER_MESSAGES: Record<ApiErrorCategory, string> = {
  validation: 'Please review the route plan details.',
  domain: 'The submitted values are not valid for route planning.',
  provider: 'A route or weather provider failed while creating this plan.',
  unavailable: 'The route planning service is temporarily unavailable. Please try again.',
  network:
    'We could not reach the route planning service. Check your connection and try again.',
  malformed: 'We could not create the route plan. Please try again.',
  aborted: 'The request was cancelled.',
  unexpected: 'We could not create the route plan. Please try again.',
};

export interface ApiErrorDetails {
  category: ApiErrorCategory;
  /** HTTP status when the request reached the backend. */
  status: number | null;
  /** Safe request identifier for support diagnostics. */
  requestId: string | null;
  /** Backend error code from the envelope, e.g. `INVALID_REQUEST`. */
  backendCode: string | null;
  /** Backend envelope message (collapsed diagnostics only). */
  backendMessage: string | null;
}

export class RoutePlanApiError extends Error {
  readonly category: ApiErrorCategory;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly backendCode: string | null;
  readonly backendMessage: string | null;

  constructor(details: ApiErrorDetails) {
    super(USER_MESSAGES[details.category]);
    this.name = 'RoutePlanApiError';
    this.category = details.category;
    this.status = details.status;
    this.requestId = details.requestId;
    this.backendCode = details.backendCode;
    this.backendMessage = details.backendMessage;
  }

  toDetails(): ApiErrorDetails {
    return {
      category: this.category,
      status: this.status,
      requestId: this.requestId,
      backendCode: this.backendCode,
      backendMessage: this.backendMessage,
    };
  }
}

/** Map an HTTP status to the matching error category. */
export function categoryForStatus(status: number): ApiErrorCategory {
  if (status === 400) return 'validation';
  if (status === 422) return 'domain';
  if (status === 502) return 'provider';
  if (status === 503) return 'unavailable';
  return 'unexpected';
}
