# Deployment

## Live backend (EC2 demo, us-east-1)

Direct (HTTP): `http://ec2-100-61-113-239.compute-1.amazonaws.com:8000`
HTTPS (CloudFront): `https://d3qhyee63c8gsx.cloudfront.net`
Distribution `EV6VWSDD3TJJL`, origin EC2:8000 (HTTP-only), caching
disabled, `AllViewerExceptHostHeader` so query strings (e.g.
`offset_hours`) reach the API while `Host` stays the EC2 name the
backend allows.

- Instance `i-08594a0ca88a818bb` (`t3.micro`, Amazon Linux 2023,
  `trucksafe-api` in `us-east-1a`), image
  `026621559747.dkr.ecr.us-east-1.amazonaws.com/trucksafe-api:cors-1`.
- Security group `sg-00889e65ca79422c1` allows TCP 8000 only (no SSH;
  management via SSM Session Manager).
- CORS is enforced by `django-cors-headers`: exact origins via
  `CORS_ALLOWED_ORIGINS`, regexes via `CORS_ALLOWED_ORIGIN_REGEXES`
  (live: `https://[a-z0-9-]+\.vercel\.app`); unlisted origins get no
  `Access-Control-Allow-Origin` (verified live against the EC2 host).
- Smoke-tested: `/api/v1/health` ok, `/api/v1/ready` ready,
  `POST /api/v1/route-plans` Chicago → Houston returns 3 routes with a
  deterministic recommendation; preflight from a `vercel.app` origin is
  echoed, other origins are not.
- Routing mode on the demo is the deterministic **mock** provider
  (`TRUCKSAFE_ROUTING_PROVIDER` unset): geometry is straight corridors
  (route polyline ≈ great-circle distance, circuity ≈ 1.00), and every
  response self-identifies with `"routing_provider": "mock"`,
  `"mock_mode": true`, plus a warning the frontend renders as a
  "Demonstration geometry" banner.

## Production routing (road network)

Set `TRUCKSAFE_ROUTING_PROVIDER=osrm` in the backend environment and
restart the container to serve road-following geometry: OSRM
`driving` profile with `overview=full&geometries=geojson` plus up to 3
alternatives (via-point re-routing pads to three when OSRM returns
fewer). No credentials; needs outbound internet to
`router.project-osrm.org` (geocoding via `photon.komoot.io`).

- Geometry contract: GeoJSON `LineString`, WGS84 `[lon, lat]`, full
  provider polyline (no straight-line substitution anywhere —
  checkpoints use cumulative route distance, the frontend renders the
  polyline verbatim). The adapter rejects malformed shapes
  (non-finite/out-of-range coordinates, swapped axis order, totals that
  disagree with the polyline) and surfaces them as `422`/`503`, never
  as silent mock geometry.
- Failure behavior: no silent fallback exists. OSRM errors propagate as
  the documented `422`/`503` envelopes after 3 transient-only attempts
  (8 s timeout per attempt).
- Truck limitation: the public OSRM demo server runs a **car profile**
  with no truck restrictions (height, weight, hazmat, truck-prohibited
  roads). Treat road geometry as corridor-accurate but not
  truck-legal; a truck-aware profile is a follow-up, not this slice.
- Load weight stays in **pounds** end to end (`load_weight_lb`):
  the form defaults to `30000` with a `30000` example placeholder, and
  the `>30,000` / `>40,000` rules compare exclusive boundaries
  (`30000` does not trigger, `30000.01` does).
- App Runner was attempted first but the account's free plan cannot
  subscribe to it (`SubscriptionRequiredException`); EC2 + CloudFront
  is the fallback.
- Cost control (t3.micro + 8 GB EBS + CloudFront requests bill while
  running): `aws ec2 stop-instances --region us-east-1 --instance-ids
  i-08594a0ca88a818bb` pauses compute; terminating deletes everything
  (also delete the ECR images, the CloudFront distribution, and the
  `TruckSafeEC2ECRRead` role if fully tearing down).

There is no production deployment in this slice beyond the demo above.

## Local demo

Backend (from `apps/api`, deterministic mock providers, no credentials):

```sh
python manage.py migrate --noinput
python manage.py runserver 8000
```

Frontend (from `apps/web`; the Vite dev server proxies `/api` to the
backend on port 8000):

```sh
npm ci
npm run dev
```

Open http://localhost:5173.

Set `TRUCKSAFE_ROUTING_PROVIDER=osrm` before starting the backend to use
the road-following OSRM/Photon adapter instead of the mock routes. It
needs internet access and no credentials; failures surface as the
documented `422`/`503` error envelopes, never with internal details.

## AWS deployment preparation

No AWS resources have been provisioned from this repository. The plan
below is ready to execute once the user approves provisioning.

### Recommended architecture

- Frontend: AWS Amplify hosting for `apps/web` (Amplify-managed domain
  with TLS; SPA fallback via a `/<*>` → `/index.html` 200 rewrite).
- Backend: AWS App Runner from `apps/api/Dockerfile` (preferred for the
  first deployment; ECS Fargate only if the repository later needs it).
- Secrets: AWS Secrets Manager or SSM Parameter Store, injected as
  App Runner environment variables (never committed).
- Logs: CloudWatch (App Runner streams stdout/stderr by default, and the
  container sets `PYTHONUNBUFFERED=1`).
- Database: none added. The demo slice uses the ephemeral SQLite file
  created at boot; do not add RDS unless the application later requires
  real persistence.

### Backend container

Build from the repository root (or set the App Runner source directory
to `apps/api`):

```sh
docker build -t trucksafe-api apps/api
docker run -e ALLOWED_HOSTS=localhost -e DJANGO_SECRET_KEY=dev-only \
  -p 8000:8000 trucksafe-api
```

- Start command (in the Dockerfile): migrate, then
  `gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000}`.
- Listens on `0.0.0.0` and honors the App Runner-provided `PORT`.
- `DJANGO_DEBUG=false` is baked in; `DJANGO_SECRET_KEY` must be supplied
  or the container fails fast instead of booting with the public dev key.
- Health checks: `GET /api/v1/health` (liveness),
  `GET /api/v1/ready` (per-dependency `200`/`503` readiness).

### Required environment variables (App Runner)

| Variable | Value | Notes |
|---|---|---|
| `DJANGO_DEBUG` | `false` | Baked into the image; override only to debug |
| `DJANGO_SECRET_KEY` | secret | From Secrets Manager/SSM; required when `DEBUG=false` |
| `ALLOWED_HOSTS` | `<service-url>,<amplify-domain>` | Comma-separated; empty default rejects all hosts when `DEBUG=false` |
| `TRUCKSAFE_ROUTING_PROVIDER` | blank (mock) | Set `osrm` only for the road-following mode (needs outbound internet, no credentials) |
| `TRUCKSAFE_WEATHER_PROVIDER` | blank | Mock-only in this slice |

### Frontend (Amplify)

Build settings: `npm ci` / `npm run build`, artifact directory
`apps/web/dist` (set the Amplify app root to `apps/web` so the defaults
apply). Environment at build time:

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://<apprunner-service>/api/v1` | No `localhost` may remain in the production build |
| `VITE_MAP_STYLE_URL` | default CARTO Positron or custom | HTTPS style document; map tiles load over HTTPS |

### CORS

Backend CORS is deferred in `specs/007-validation-and-reliability.md`
(no `django-cors-headers` in this slice). Until an allowlist exists,
serve the frontend and the API from one origin (Amplify rewrite/proxy
to the App Runner service) or keep the API private to the demo. Adding
a CORS allowlist for exactly the Amplify domain is a pre-launch
follow-up, not a code change made here.

### Provider modes

- Mock mode (default, no credentials, offline-capable): deterministic
  routes and weather; label any hosted demo as demonstration data, never
  as live provider data.
- Real routing mode (`TRUCKSAFE_ROUTING_PROVIDER=osrm`): road-following
  OSRM/Photon over the public demo endpoints (internet egress required,
  no credentials); transient failures surface as documented `503`s.
  A weather adapter beyond the mock does not exist yet.

### Rollback

App Runner keeps prior revisions: roll back by deploying the previous
image revision in the console. Amplify likewise redeploys any prior
build. Both are stateless in this slice, so rollback is a redeploy.

### Cost considerations

Amplify hosting (build minutes + bandwidth) and App Runner (per
provisioned vCPU/GB-hour, scales to the configured concurrency) are the
only expected charges. No RDS, ElastiCache, or NAT gateway is part of
this plan.

### Manual smoke test after deploy

1. `GET https://<apprunner-service>/api/v1/health` → `200`.
2. `GET https://<apprunner-service>/api/v1/ready` → `200` with database
   `available`.
3. Open the Amplify URL, plan Chicago, IL → Houston, TX: 3 routes, map
   with checkpoints, heatmap, and slider `0`–`48` all render.
4. Move the slider to `+48h`: the forecast label updates; break the grid
   request and confirm routes stay with a forecast warning.

## Deferred for a production deployment

- Managed database and cache (the local demo uses SQLite; `POSTGRES_*`
  and `REDIS_URL` in `.env.example` are planned, not wired).
- CORS allowlist, rate limiting, and structured request logging
  (deferred in `specs/007-validation-and-reliability.md`).
