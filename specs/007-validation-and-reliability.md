# Validation and Reliability

## Goal

Ensure that route planning is safe, deterministic, observable, and resilient to
invalid input and external provider failures.

## Input Validation

The backend must validate:

- Required fields.
- Maximum string lengths.
- ISO 8601 timestamps.
- Supported checkpoint intervals.
- Non-negative finite load weights.
- Valid provider response structures.

## External Provider Reliability

Provider clients must implement:

- Connection timeout (deferred: mock providers perform no I/O).
- Total request timeout (deferred: mock providers perform no I/O).
- Retry for transient failures only (implemented: up to 3 total attempts).
- Exponential backoff (deferred: retries are currently immediate).
- Response schema validation (implemented at protocol/domain boundaries).
- Safe error mapping (implemented: `400`/`422`/`503` envelopes).
- Cache support where applicable (deferred).

Retries must not be performed for permanent validation errors.

## API Security

- Private provider credentials must remain server-side (no credentials exist in this slice).
- CORS must allow only trusted origins (deferred: no CORS policy configured yet).
- Rate limiting must be applied to route planning requests (deferred: no throttling configured yet).
- Error responses must not expose stack traces (implemented and tested).
- User-provided values must not be used to construct arbitrary URLs (no URL construction from user input exists).
- External hosts must be restricted through an allowlist (deferred: no external calls exist).

## Observability

Every request includes:

- Request ID (implemented: valid client `X-Request-ID` propagated, otherwise generated; echoed in the response header and error envelope).
- Route plan ID when available (implemented in success responses).
- Error code when applicable (implemented in error envelopes).
- Provider name, request duration, result status (deferred: no structured logging yet).

## Acceptance Criteria

- [ ] Invalid input returns a structured client error.
- [ ] Provider timeouts return a safe service error.
- [ ] Malformed provider responses are rejected.
- [ ] Rate limiting is enabled for route planning requests.
- [ ] Secrets are not exposed in frontend bundles or logs.
- [ ] Health and readiness endpoints are available.
- [ ] Critical failures are logged with a request ID.
- [ ] Security and reliability behavior is covered by integration tests.