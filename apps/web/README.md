# TruckSafe Web

React frontend for the TruckSafe route-planning API. Vertical slices
delivered: a single page to create a route plan and compare the returned
alternatives, plus an interactive map visualization of those alternatives.

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
- Interactive route map (MapLibre GL JS): route geometries, checkpoint
  markers colored by risk, origin/destination markers, recommendation
  emphasis, selection synchronized with the route cards, legend, and an
  accessible route list that works with or without the visual map. The map
  degrades to the textual comparison whenever geometry or map rendering is
  unavailable.
- Vitest + React Testing Library + MSW tests, axe accessibility checks,
  and Playwright end-to-end coverage of the critical flows.

Deferred (not implemented): weather heatmap, forecast slider,
real provider adapters, OpenAPI-generated client, Storybook,
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

| Variable             | Default                                           | Purpose                                              |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `VITE_API_BASE_URL`  | `/api/v1`                                         | TruckSafe API base URL (no trailing slash).          |
| `VITE_MAP_STYLE_URL` | public CARTO Positron style (no token, see below) | MapLibre style document URL (`''` disables the map). |

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
- Route map (`src/features/route-map/`, `src/components/route-map/`):
  - Rendering uses MapLibre GL JS directly behind a thin adapter
    (`mapAdapter.ts`), the only module importing `maplibre-gl`. No Mapbox
    token, no geocoding, no telemetry.
  - Default basemap is the public CARTO Positron style (no credentials;
    attribution is shown by the map). Tiles require network access; tests
    intercept the style with a local empty document. Set
    `VITE_MAP_STYLE_URL` to a custom style URL for development, or to an
    empty string to disable the map and always show the fallback.
  - Backend geometry is GeoJSON `LineString` with `[longitude, latitude]`
    WGS84 coordinates; checkpoint `latitude`/`longitude` are separate
    fields. Everything is re-validated in `geo.ts` (finite numbers, WGS84
    bounds, minimum two points) before reaching the map library. Invalid
    geometry is omitted and reported; route cards always remain.
  - Route-level styling (recommended / selected / eligible / ineligible /
    No Travel via width, opacity, dash, and labels) plus segment-level
    risk coloring: the backend returns `risk_segments` with
    `start_index`/`end_index` into the returned `geometry`, and the map
    slices that geometry into one colored feature per segment. Unavailable
    segment risk stays gray, never Low, and mismatched intervals fall
    back to route-level coloring for that route.
  - The map chunk (`maplibre-*`) is lazy-loaded with the result section:
    the initial form route ships without it (~24 kB app JS). The map
    vendor chunk is large (~1 MB raw, ~290 kB gzip); keep it lazy and
    revisit if it grows.
- Map limitations: basemap tiles need network access; without WebGL, a
  style, or valid geometry the section shows an accessible fallback with
  the full textual comparison. The radio-button route list is the primary
  selection control and works identically without the visual map.
