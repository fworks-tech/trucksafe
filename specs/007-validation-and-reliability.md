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

- Connection timeout.
- Total request timeout.
- Retry for transient failures only.
- Exponential backoff.
- Response schema validation.
- Safe error mapping.
- Cache support where applicable.

Retries must not be performed for permanent validation errors.

## API Security

- Private provider credentials must remain server-side.
- CORS must allow only trusted origins.
- Rate limiting must be applied to route planning requests.
- Error responses must not expose stack traces.
- User-provided values must not be used to construct arbitrary URLs.
- External hosts must be restricted through an allowlist.

## Observability

Every request should include:

- Request ID
- Route plan ID when available
- Provider name
- Request duration
- Result status
- Error code when applicable

## Acceptance Criteria

- [ ] Invalid input returns a structured client error.
- [ ] Provider timeouts return a safe service error.
- [ ] Malformed provider responses are rejected.
- [ ] Rate limiting is enabled for route planning requests.
- [ ] Secrets are not exposed in frontend bundles or logs.
- [ ] Health and readiness endpoints are available.
- [ ] Critical failures are logged with a request ID.
- [ ] Security and reliability behavior is covered by integration tests.