# AGENTS.md

## Repo status: design docs only — scaffolding in progress

`apps/api` and `apps/web` are empty directories. There are no manifests, no CI, no Makefile, no docker-compose, no OpenAPI contract. The README and docs describe a **target** React + Django system that is not built. Commands shown in README/docs (`pip install`, `npm run dev`, `pytest`, `make test`, etc.) will fail until scaffolding lands — treat them as requirements, not verified tooling. `.env.example` and `docs/deployment.md` are empty stubs. No `.gitignore` exists yet; never commit `.env` or keys.

## Implementation plan (approved — follow this ordering)

1. **Monorepo structure**: `apps/api` (Django), `apps/web` (React), `packages/contracts` (OpenAPI). Note two "apps" levels — repo-wide `apps/` vs Django apps nested under `apps/api/apps/{routing,risk,weather,common}`.
2. **Minimal frontend**: form → Zod validation → mocked response. Layout: `src/app`, `src/components/{ui,route-planning-form,route-card}`, `src/features/route-planning/{api,hooks,schemas,types}.ts`, `src/lib/http.ts`.
3. **Minimal backend**: Django project under `apps/api/config/` + Django apps under `apps/api/apps/`; first endpoint `POST /api/v1/route-plans` with a **mocked routing provider** (no external credentials needed to run the risk business logic).
4. **Risk engine first** — `apps/api/apps/risk/{engine,rules,schemas}.py` + tests. Django-free nucleus; everything else wraps it.
5. **Contracts before adapters** — `packages/contracts/openapi.yaml` + `schemas/*.yaml` ship before provider adapters; generate frontend TypeScript types into `packages/contracts/generated/` to prevent FE/BE drift.

## Source of truth

- `specs/*.md` — feature specifications with acceptance criteria ([ ] checklists) that implementation must satisfy.
- `docs/decisions/ADR-*-*.md` — accepted architecture decisions (stack, provider isolation, ranking algorithm).
- `docs/architecture.md`, `docs/api.md`, `docs/risk-model.md` — design contract. New work must keep these in sync (README "Definition of Done" requires doc updates).

When docs and code conflict after implementation starts, code wins but the doc must be fixed.

## Development workflow

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`. Types: `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, `chore`, `revert` (`!` marks breaking changes). Subject is imperative, lowercase, ≤ 150 chars, no trailing period. One logical change per commit; split when in doubt. Existing commits use plain lowercase `add ...` — new work must be conventional.
- **Branches**: never commit directly to `main`. Start from updated `main` and use `type/short-description`, e.g. `feat/risk-engine`, `chore/scaffold-monorepo`. Pull requests link the relevant issue.
- **PR titles** follow the same Conventional Commits format as commits; body states what changed, why, and how to test. Verify the title matches the actual diff before merging.
- **Tests and docs are part of the change**: run the app-local test/lint/typecheck commands in the touched `apps/*` dir once scaffolding exists (README Definition of Done), and update `docs/` + `packages/contracts/` in the same commit that changes behavior.
- **Never commit** `.env`, API keys, or private credentials; no `.gitignore` exists yet, so add one with the scaffolding commit.

## Domain rules (do not reinvent — all are precisely specified)

- **Risk thresholds** use lower-inclusive / upper-exclusive intervals: 25 mph → Moderate, 35 → High, 45 → Severe, 55+ → No Travel (wind). Rain/snow follow the same convention (see `docs/risk-model.md` — note rain/snow top band is inclusive at 1.00 / 3.00).
- **Risk precedence**: NO_TRAVEL > SEVERE > HIGH > MODERATE > LOW; highest severity wins.
- **Load rules** may only *raise* risk, never lower it (>30,000 lb at 45–54 mph → No Travel; >40,000 lb at 35–44 mph → Severe).
- **Route ranking key**, lexicographic minimum: `(severe_miles, high_miles, average_risk_score, duration_seconds)`. Deterministic.
- **Risk scores**: Low 1, Moderate 2, High 3, Severe 4, No Travel 5.
- **Canonical units** everywhere: miles, mph, inches/hr, pounds, seconds, WGS84 coordinates, UTC timestamps.
- **Checkpoint ETA**: `departure + (checkpoint_distance / total_distance) × duration`, interpolated along route geometry.

## Architecture constraints (from ADRs)

- Risk and recommendation domain logic must be **independent of Django, HTTP clients, and the DB** — pure, unit-testable without infrastructure (100% coverage expected for both engines).
- External routing/weather providers go behind adapter interfaces (`RoutingProvider`, `WeatherProvider`): auth, timeouts, retry (transient only, exponential backoff, no retry on permanent validation errors), response schema validation, unit conversion, normalization to internal models. No provider formats leak into domain/frontend.
- `packages/contracts/openapi.yaml` is the API contract; changing the API means updating it and the generated frontend types in `packages/contracts/generated/`.
- API base is `/api/v1`; error shape is `{"error": {"code", "message", "request_id"}}`; endpoints: `POST/GET /route-plans`, `GET /route-plans/{id}/weather-grid?offset_hours=0..48`, `GET /health`, `GET /ready`. Checkpoint interval restricted to 10/25/50.
- Property-based tests (Hypothesis) should cover the invariants in `docs/testing.md` (monotonic risk vs. wind/load, ordered checkpoints, non-decreasing ETAs, deterministic ranking). External providers always mocked in tests — no live calls.