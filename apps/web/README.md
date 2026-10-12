# TruckSafe Web

React frontend for the TruckSafe route-planning API. First vertical slice:
a single page to create a route plan and compare the returned alternatives.

## Scope

Implemented:

- Route-plan form (origin, destination, departure, load weight, checkpoint
  interval) with React Hook Form + Zod validation.
- Typed API client for `POST /api/v1/route-plans` with request-ID handling
  and typed error categories.
- Loading, success, validation-error, provider-error, and unexpected-error
  states with safe user-facing messages.
- Route comparison (exactly the alternatives the backend returns),
  recommendation summary, warnings, checkpoints, weather availability, and
  UTC ETAs.
- Vitest + React Testing Library + MSW tests, axe accessibility checks,
  and Playwright end-to-end coverage of the critical flows.

Deferred (not implemented): interactive map, weather heatmap, forecast
slider, real provider adapters, OpenAPI-generated client, Storybook,
production deployment, authentication, observability, rate limiting.

Results use deterministic demonstration data from the backend mock
providers. The UI never presents mock weather as live weather.

## Prerequisites

- Node.js >= 20 and npm.
- The Django backend running locally (see the root README). The backend
  uses deterministic mock providers, so no external credentials are needed.

## Install

```sh
npm ci
```

## Local development

1. Start the backend on port 8000 (from `apps/api`):

   ```sh
   python manage.py runserver 8000
   ```

2. Start the frontend (from `apps/web`):

   ```sh
   npm run dev
   ```

3. Open http://localhost:5173.

The Vite dev server proxies `/api/*` to `http://localhost:8000`, so the
browser stays same-origin and no backend CORS changes are needed. A
production deployment must serve the frontend and the API from the same
origin or configure backend CORS for the trusted frontend origin; there is
no production CORS configuration in this slice.

## Environment configuration

Copy `.env.example` to `.env` to override defaults:

| Variable            | Default   | Purpose                                     |
| ------------------- | --------- | ------------------------------------------- |
| `VITE_API_BASE_URL` | `/api/v1` | TruckSafe API base URL (no trailing slash). |

Vite exposes every `VITE_*` variable to the browser bundle. These values
are public configuration and must never hold secrets or credentials.

## Scripts

| Script                  | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Start the Vite dev server.                   |
| `npm run build`         | Typecheck and produce a production build.    |
| `npm run preview`       | Preview the production build.                |
| `npm run lint`          | Run ESLint.                                  |
| `npm run typecheck`     | Run `tsc -b` (app + node configs).           |
| `npm test`              | Run Vitest once.                             |
| `npm run test:watch`    | Run Vitest in watch mode.                    |
| `npm run test:coverage` | Run Vitest with V8 coverage + thresholds.    |
| `npm run format`        | Rewrite files with Prettier.                 |
| `npm run format:check`  | Verify Prettier formatting.                  |
| `npm run e2e`           | Run Playwright (needs the backend on :8000). |

## Architecture notes

- Form state lives in React Hook Form; the Zod schema is the single source
  of client validation (`src/features/route-planning/schemas.ts`).
- Server state lives in TanStack Query (`useRoutePlanMutation`). The
  mutation never retries the POST and supports cancellation; each
  submission clears the previous result first.
- `datetime-local` input carries no timezone: it is interpreted in the
  browser's local timezone and serialized to an explicit UTC ISO 8601
  string (`src/lib/datetime.ts`). Returned ETAs are UTC and always
  displayed with a `UTC` marker.
- Visual system: centralized Material UI theme (`src/app/theme.ts`) with
  semantic risk tokens. Every risk indicator pairs color with text.
