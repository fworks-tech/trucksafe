/** Request-ID helpers mirroring the backend trust rule.
 *
 * The backend (`RequestIdMiddleware`) propagates a client-provided
 * `X-Request-ID` only when it matches `1-128 [A-Za-z0-9_-]`; anything else
 * is replaced server-side. The client therefore always sends a value that
 * satisfies the rule, generated per request when none is supplied.
 */

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Return whether a request id is safe to propagate to the backend. */
export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

/** Generate a 32-hex request id (same shape the backend generates). */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // ponytail: Math.random fallback for non-secure contexts, ids are
  // diagnostics only and carry no authority.
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

/** Use the supplied id when valid, otherwise generate a fresh one. */
export function resolveRequestId(provided?: string): string {
  return isValidRequestId(provided) ? provided : generateRequestId();
}
