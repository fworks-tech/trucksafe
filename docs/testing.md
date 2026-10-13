# Testing Strategy

## Testing Goals

Testing focuses on:

- Correctness of business rules.
- Reliability of external integrations.
- API contract compatibility.
- User interface behavior.
- Map and heatmap interactions.
- Regression prevention.

## Test Levels

```text
Unit Tests
    ↓
Integration Tests
    ↓
API Contract Tests
    ↓
End-to-End Tests
```

## Backend Unit Tests

Unit tests should cover:

- Wind classification.
- Rain classification.
- Snow classification.
- Load restrictions.
- Risk precedence.
- Risk reasons.
- Checkpoint generation.
- Route geometry interpolation.
- ETA calculation.
- Route metric aggregation.
- Route recommendation ordering.
- Unit conversions (deferred: mocks already use canonical units, so no conversion path exists yet).

The risk and recommendation engines should be tested without requiring Django, a database, or external APIs.

## Property-Based Tests

Property-based tests should verify invariants such as:

- Increasing wind speed cannot lower the risk.
- Increasing load weight cannot lower the risk.
- Checkpoints are ordered by distance.
- Checkpoint ETAs are non-decreasing.
- Route ranking is deterministic.
- Route distance metrics are non-negative.

## Integration Tests

External providers must be mocked in integration tests.

Test scenarios include:

- Successful geocoding.
- Successful route generation.
- Successful weather forecast.
- Provider timeout (covered: the OSRM adapter maps transport timeouts
  to transient errors with an 8-second request timeout; mock providers
  perform no I/O).
- Provider rate limiting (deferred).
- Malformed provider response.
- Missing weather data.
- Fewer than three route alternatives (deferred: the protocol requires exactly three).
- Cache hit (deferred: no cache yet).
- Cache miss (deferred: no cache yet).
- Database failure (covered: readiness reports `503` with `database`
  `unavailable` when the connection check fails; no Redis exists yet).
- Redis failure (deferred: no Redis yet).

## API Tests

API tests should cover:

- Valid route plan request.
- Missing fields.
- Invalid addresses.
- Invalid timestamps.
- Negative load weights.
- Unsupported checkpoint intervals.
- Invalid provider payloads.
- Consistent error responses.
- Health endpoint (implemented: exact `{"status": "ok"}` shape, no DB
  writes, no provider use, request-ID propagation; `/health` and
  `/health/`).
- Readiness endpoint (implemented: `200` all-ok, `503` per-check
  `unavailable` for database/routing/weather failures, safe payloads;
  `/ready` and `/ready/`).
- End-to-end route-plan invariants through HTTP: ordered checkpoints,
  non-decreasing UTC ETAs, explicit unavailable weather (never Low),
  deterministic warnings, UTC-equivalent idempotency, exact retry call
  counts, and no partial persistence after failures
  (`route_plans/tests/test_integration.py`).
- Rate limiting (deferred: not implemented).
- CORS behavior (deferred: not implemented).

## Frontend Tests

Frontend tests should cover:

- Form validation.
- Submit behavior.
- Loading state.
- Error state.
- Route cards.
- Recommended route indicator.
- Checkpoint details.
- Risk badges.
- Map layer updates.
- Heatmap legend.
- Forecast slider.
- Empty and partial data states.

## End-to-End Test

The main end-to-end flow is:

1. Open the application.
2. Enter an origin.
3. Enter a destination.
4. Select a departure date and time.
5. Enter the load weight.
6. Submit the form.
7. Wait for the route plan.
8. Verify route alternatives.
9. Verify the recommended route.
10. Verify route summaries.
11. Verify checkpoint information.
12. Change the forecast slider.
13. Verify the heatmap updates.

## Coverage Expectations

The project should maintain:

- 100% coverage for the risk engine.
- 100% coverage for the route recommendation engine.
- High coverage for API services and validation.
- End-to-end coverage for the primary user journey.

Coverage percentages should not be increased by excluding untested production code.

## Local Commands

### Backend

```bash
pytest
pytest --cov
pytest --cov-report=html
```

### Frontend

```bash
npm run test
npm run test:coverage
npm run e2e
```

`npm run e2e` needs the API on `:8000`; Playwright starts the Vite dev
server itself.

## Continuous Integration

`.github/workflows/ci.yml` runs the local commands above on every pull
request and every push to `main`, in three independent jobs:

| Job | Working directory | Commands |
|-----|-------------------|----------|
| `backend` | `apps/api` | `ruff check .`, `ruff format --check .`, `mypy .`, `python -m pytest -q` |
| `web` | `apps/web` | `npm run typecheck`, `npm run lint`, `npm run test -- --run`, `npm run format:check`, `npm run build` |
| `e2e` | both | `npm run e2e -- --workers=1`, with a migrated API on `:8000` behind the Vite dev proxy |

The backend runs with no environment configuration: `DJANGO_DEBUG`
defaults to on and the secret key falls back to the development value,
so SQLite and the mock providers need no secrets. The frontend needs no
`.env` either, because the client falls back to same-origin `/api/v1`.

Coverage is measured by `npm run test:coverage` against the thresholds in
`apps/web/vite.config.ts`, but it is not a CI gate. Each job uploads
Playwright artifacts only when it fails, so a red run carries its own
evidence.

## Test Data

Tests should use deterministic fixtures.

External provider responses should be stored as sanitized fixtures when useful. Secrets and real user data must never be included in test fixtures.

## Definition of Done

A feature is complete when:

- Unit tests pass.
- Integration tests pass.
- API contracts are valid.
- The primary user flow is covered where applicable.
- Relevant edge cases are tested.
- Linting and type checking pass.
- Documentation is updated.