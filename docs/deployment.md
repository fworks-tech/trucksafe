# Deployment

There is no production deployment in this slice. The supported way to run
the application is the local demo setup below; a hosted application has
not been verified from this repository.

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

## Deferred for a production deployment

- Host and reverse-proxy for the Django API and the static frontend
  (serve both from one origin or configure backend CORS).
- Managed database and cache (the local demo uses SQLite; `POSTGRES_*`
  and `REDIS_URL` in `.env.example` are planned, not wired).
- Provider credentials, secret management, and log redaction review.
- CORS allowlist, rate limiting, and structured request logging
  (deferred in `specs/007-validation-and-reliability.md`).
