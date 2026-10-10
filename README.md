# Weather-Aware Truck Routing

A full-stack web application that helps truck drivers compare route options based on weather conditions, load weight, travel time, and checkpoint-level risk analysis.

The application generates route alternatives, samples weather conditions along each route using estimated arrival times, classifies operational risk, and recommends the safest route according to deterministic business rules.

> This project prioritizes correctness, explainability, safety, and maintainability over unnecessary features.

---

## Overview

The user provides:

- Origin
- Destination
- Departure date and time
- Load weight
- Checkpoint interval (10, 25, or 50 miles)

The application then:

1. Generates exactly three route options using a routing provider.
2. Creates checkpoints at a 10, 25, or 50-mile interval along each route.
3. Calculates the estimated arrival time at each checkpoint.
4. Retrieves hourly weather forecasts for each checkpoint.
5. Classifies weather risk using wind, rain, and snow conditions.
6. Applies truck load restrictions.
7. Compares the three routes.
8. Recommends the best eligible route.
9. Displays routes, checkpoints, risks, ETAs, and summaries on a map.
10. Displays a weather risk heatmap along the trip corridor.
11. Provides a forecast slider covering offsets from 0 through 48 hours after departure.

---

## Project Status

The project is being implemented incrementally using vertical slices.

### Implemented

- Repository and monorepo structure
- Architecture, API, risk-model, testing, and local-development documentation
- Feature specifications in `specs/`
- Django API foundation: project package `config`, settings, root URLs, `manage.py`
- Framework-independent weather risk engine in `risk/`:
  - Wind, rain, and snow threshold classification
  - Load-sensitive risk rules
  - Risk precedence (highest severity wins)
  - Rejection of negative, NaN, and infinite values
- Framework-independent checkpoint generation and ETA calculation in `routing/`:
  - 10, 25, and 50-mile intervals
  - Mandatory origin and destination checkpoints
  - Cumulative-distance ETA interpolation along route geometry
- Boundary-value test suite covering every threshold, load rule, invalid input, checkpoint interval boundary, and destination inclusion (72 passing tests)

### In Progress

- Route recommendation engine and ranking
- Route-planning API endpoint (`POST /api/v1/route-plans`)

### Planned (Not Implemented Yet)

- Routing and weather provider adapters (mocked provider first)
- React frontend: form, route cards, map, heatmap, forecast slider
- OpenAPI contract in `packages/contracts/openapi.yaml`
- PostgreSQL/PostGIS persistence, Redis caching, Celery tasks
- Docker, Docker Compose, CI/CD workflows
- Health and readiness endpoints
- Integration tests, API contract tests, and Playwright end-to-end tests

**No external routing or weather provider is connected yet.** The backend currently runs on Django defaults with SQLite and needs no external services or credentials.

---

## Technology Stack

### Backend (Implemented)

- Python 3.11+
- Django 4.2.x
- Django REST Framework (installed and registered; views and serializers not yet implemented)
- Python dataclasses for framework-independent domain objects
- pytest, pytest-django, pytest-cov
- Ruff, mypy

### Frontend (Planned)

- React
- TypeScript
- Vite
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- Mapbox GL JS

### Data and Infrastructure (Planned)

- PostgreSQL with PostGIS
- Redis
- Celery
- Docker and Docker Compose
- GitHub Actions

---

## Architecture Principles

- Domain logic is independent from Django, HTTP clients, and the database.
- External providers are accessed through adapter interfaces.
- Provider responses are normalized before entering the domain layer.
- Risk classification is deterministic and testable.
- All timestamps are represented in UTC.
- Units are explicit: miles, mph, inches/hour, pounds, seconds, WGS84 coordinates.
- Validation occurs at frontend and backend boundaries.
- Missing weather data is never silently treated as safe weather.
- Security-sensitive configuration is kept outside source control.

---

## Repository Structure

```text
.
├── apps/
│   ├── api/
│   │   ├── config/                 # Django project package
│   │   │   ├── __init__.py
│   │   │   ├── settings.py
│   │   │   ├── urls.py
│   │   │   ├── asgi.py
│   │   │   └── wsgi.py
│   │   ├── risk/                   # Weather risk domain (framework-independent)
│   │   │   ├── apps.py
│   │   │   ├── engine.py
│   │   │   ├── rules.py
│   │   │   ├── schemas.py
│   │   │   └── tests/
│   │   ├── routing/                # Checkpoint and ETA domain (framework-independent)
│   │   ├── manage.py
│   │   ├── pyproject.toml
│   │   └── Dockerfile              # Placeholder, not yet configured
│   └── web/                        # React frontend (planned, currently empty)
├── docs/                           # Architecture and technical documents
├── specs/                          # Feature specifications
├── .env.example
├── .gitignore
└── README.md
```

The backend intentionally uses flat packages:

```text
apps/api/config
apps/api/risk
apps/api/routing
```

instead of a duplicated structure such as:

```text
apps/api/apps/risk
```

Backend imports follow the same convention:

```python
from risk.engine import calculate_risk
```

---

## Requirements

- Git
- Python 3.11 or newer

Not required for the current foundation: Node.js, Docker, PostgreSQL, Redis. They become relevant when the planned frontend and infrastructure are implemented.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/fworks-tech/trucksafe.git
cd trucksafe
```

### 2. Create a Virtual Environment

```bash
cd apps/api
python -m venv .venv
```

Activate the environment.

On macOS or Linux:

```bash
source .venv/bin/activate
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Install Backend Dependencies

```bash
cd apps/api
python -m pip install -e ".[dev]"
```

### 4. Validate the Installation

```bash
cd apps/api
python manage.py check
python -m pytest
```

Expected result: Django reports no issues and all tests pass.

### 5. Run the API (Optional)

```bash
cd apps/api
python manage.py runserver
```

The API will be available at:

```text
http://localhost:8000
```

No route-planning endpoints are exposed yet; only the Django admin path is registered.

### Environment Variables

`.env.example` documents planned configuration (database, Redis, provider credentials, frontend tokens). None of these values are required to run the current foundation: settings use SQLite defaults and no provider integrations exist.

Never commit `.env` files or private credentials.

---

## Available Commands

### Backend

Run these commands from `apps/api`:

```bash
python manage.py runserver        # Start the development server
python manage.py check            # Run Django system checks
python manage.py migrate          # Apply database migrations
python manage.py makemigrations   # Create database migrations
python -m pytest                  # Run backend tests
python -m pytest --cov=risk       # Run risk engine tests with coverage
ruff check .                      # Run Python linting
ruff format --check .             # Check Python formatting
mypy .                            # Run static type checking
```

### Frontend

Frontend commands are planned. `apps/web` is an empty placeholder directory.

---

## Risk Classification

Risk is calculated independently at each route checkpoint.

Risk levels are ordered as follows:

```text
No Travel > Severe > High > Moderate > Low
```

Negative, NaN, and infinite weather values are invalid and must be rejected.

### Wind

| Condition | Risk |
|---|---|
| `0 <= wind_mph < 25` | Low |
| `25 <= wind_mph < 35` | Moderate |
| `35 <= wind_mph < 45` | High |
| `45 <= wind_mph < 55` | Severe |
| `wind_mph >= 55` | No Travel |

### Rain

| Condition | Risk |
|---|---|
| `0 <= rain_inches_per_hour < 0.10` | Low |
| `0.10 <= rain_inches_per_hour < 0.25` | Moderate |
| `0.25 <= rain_inches_per_hour < 0.50` | High |
| `0.50 <= rain_inches_per_hour <= 1.00` | Severe |
| `rain_inches_per_hour > 1.00` | No Travel |

### Snow

| Condition | Risk |
|---|---|
| `0 <= snow_inches_per_hour < 0.5` | Low |
| `0.5 <= snow_inches_per_hour < 1.0` | Moderate |
| `1.0 <= snow_inches_per_hour < 2.0` | High |
| `2.0 <= snow_inches_per_hour <= 3.0` | Severe |
| `snow_inches_per_hour > 3.0` | No Travel |

When multiple weather conditions apply at the same checkpoint, the highest severity wins.

For example, if wind is `Moderate`, rain is `High`, and snow is `Low`, the final weather classification is `High`.

---

## Load Rules

Load rules are applied after the independent weather classifications.

- `wind_mph >= 55` results in `No Travel` for every load.
- `45 <= wind_mph < 55` and `load_weight_lb > 30,000` results in `No Travel`.
- `35 <= wind_mph < 45` and `load_weight_lb > 40,000` results in `Severe`.

Load weight must be finite and greater than or equal to zero.

Load rules may increase the risk level but must never reduce an existing weather risk classification.

Examples:

| Wind | Load | Result |
|---:|---:|---|
| 55 mph | Any valid load | No Travel |
| 45 mph | 30,000 lb | Severe |
| 45 mph | 30,001 lb | No Travel |
| 35 mph | 40,000 lb | High |
| 35 mph | 40,001 lb | Severe |

---

## Route Recommendation

Routes are ranked using a deterministic lexicographical comparison in this exact priority order:

1. Fewest Severe-risk miles
2. Fewest High-risk miles
3. Lowest average risk
4. Shortest travel time

The recommendation key is:

```text
(
  severe_miles,
  high_miles,
  average_risk_score,
  duration_seconds
)
```

Lower values are preferred for every item in the key.

`No Travel` is the highest risk level. A route containing `No Travel` segments must be clearly flagged in the response and user interface; it must never be silently treated as safe.

Risk scores:

| Risk | Score |
|---|---:|
| Low | 1 |
| Moderate | 2 |
| High | 3 |
| Severe | 4 |
| No Travel | 5 |

> The ranking engine is planned. The priority order above is normative and must be implemented exactly as written.

---

## Checkpoints and ETA

The user selects one checkpoint interval:

- 10 miles
- 25 miles
- 50 miles

Checkpoints are generated along the route geometry using the selected interval.

Each route contains:

- Origin checkpoint
- Intermediate checkpoints at the selected interval
- Destination checkpoint

The destination is always included as the final checkpoint, even when the route length is not an exact multiple of the selected interval.

The estimated arrival time at a checkpoint is calculated using cumulative route distance:

```text
checkpoint_eta =
    departure_at
    + (checkpoint_distance / total_route_distance)
    * route_duration
```

This calculation assumes a constant average speed. It does not model stops, traffic changes, or future delays unless segment-level duration data is available from the routing provider.

All timestamps use UTC ISO 8601 format:

```text
2026-10-09T14:00:00Z
```

Weather conditions are retrieved using:

- Checkpoint latitude
- Checkpoint longitude
- Checkpoint estimated arrival time

If weather data is unavailable for a checkpoint, the system returns an explicit unavailable or degraded state. Missing data is never silently converted to `Low` risk.

---

## Weather Forecast Horizon

The forecast horizon covers offsets from:

```text
0 through 48 hours after departure
```

The forecast slider accepts only values in the inclusive range:

```text
0 <= offset_hours <= 48
```

If a checkpoint ETA falls outside the supported forecast horizon, the checkpoint exposes a weather-data-unavailable state.

---

## Weather Heatmap

The heatmap displays weather-related operational risk along the route corridor.

The map distinguishes the following states:

| Risk | Suggested Color |
|---|---|
| Low | Green |
| Moderate | Yellow |
| High | Orange |
| Severe | Red |
| No Travel | Dark red |
| Unavailable | Gray |

> The heatmap is planned. It has not been implemented yet.

---

## API

The API will use versioned endpoints under:

```text
/api/v1
```

> The API contract is planned. No route-planning endpoints exist yet. The contract below is defined in [docs/api.md](docs/api.md) and will be implemented in `packages/contracts/openapi.yaml`.

### Create a Route Plan

```http
POST /api/v1/route-plans
```

Request:

```json
{
  "origin": "Denver, CO",
  "destination": "Kansas City, MO",
  "departure_at": "2026-10-09T14:00:00Z",
  "load_weight_lb": 35000,
  "checkpoint_interval_miles": 25
}
```

Validation rules:

- `origin` is required.
- `destination` is required.
- `origin` and `destination` must not be identical.
- `departure_at` must be a valid UTC ISO 8601 timestamp.
- `load_weight_lb` must be finite and greater than or equal to zero.
- `checkpoint_interval_miles` must be `10`, `25`, or `50`.

Successful response: `201 Created`.

### Retrieve a Route Plan

```http
GET /api/v1/route-plans/{route_plan_id}
```

The response includes the request inputs, the three route alternatives, route geometries, route summaries, checkpoints, checkpoint ETAs, weather observations, risk classifications, the recommendation result, and provider or data availability warnings.

### Retrieve Weather Grid Data

```http
GET /api/v1/route-plans/{route_plan_id}/weather-grid?offset_hours=12
```

The `offset_hours` parameter supports values from `0` through `48`.

### Health Check

```http
GET /api/v1/health
```

### Readiness Check

```http
GET /api/v1/ready
```

### Error Format

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request contains invalid data.",
    "request_id": "request-id"
  }
}
```

### HTTP Status Codes

| Status | Meaning |
|---:|---|
| `200` | Successful request |
| `201` | Resource created |
| `400` | Invalid request |
| `404` | Resource not found |
| `422` | Valid request format but invalid domain value |
| `502` | External provider failure |
| `503` | Service temporarily unavailable |
| `500` | Unexpected server error |

---

## Provider Integrations (Planned)

Routing, geocoding, and weather providers will be accessed through adapter interfaces.

Provider adapters will be responsible for:

- Building provider requests
- Applying connection and read timeouts
- Retrying transient failures with exponential backoff
- Normalizing and validating provider responses
- Mapping provider errors to explicit unavailable or degraded states
- Supporting mocks in automated tests

The core risk and recommendation engines do not depend on provider-specific response formats.

During development, mocked provider responses will be used. Mock data must never be presented as live weather data in production.

---

## Testing Strategy

### Implemented

Backend unit tests cover the weather risk engine and checkpoint generation:

- Every wind, rain, and snow threshold boundary
- Values immediately below, at, and above every threshold
- Load rule boundaries (`30,000`/`30,001` lb and `40,000`/`40,001` lb)
- Risk precedence (highest severity wins)
- Deterministic risk reasons
- Rejection of negative, NaN, and infinite weather and load values
- Checkpoint interval boundaries (exact multiples and remainder routes)
- Mandatory origin and destination checkpoints
- Ordered checkpoints and non-decreasing ETAs
- Rejection of invalid intervals, durations, coordinates, and naive timestamps

Run them with:

```bash
cd apps/api
python -m pytest
python -m pytest --cov=risk
```

### Planned

- Unit tests for route recommendation and ranking
- Integration tests with mocked routing and weather providers
- API contract tests against the OpenAPI document
- Playwright end-to-end tests for the primary user journey
- Property-based tests (Hypothesis) for ranking and checkpoint invariants

---

## Security

- Backend validation for every request
- Secrets stored outside source control
- Private provider credentials kept server-side
- External provider timeouts and retries
- Structured error responses without stack traces
- Restricted `ALLOWED_HOSTS` in production
- Rate limiting for route-planning requests (planned)
- CORS restricted to trusted frontend origins (planned)

Never commit:

- `.env` files
- API tokens
- Private keys
- Cloud credentials
- Database passwords

A `SECURITY.md` policy file is planned and does not exist yet.

---

## Documentation

- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Local Development](docs/local-development.md)
- [Risk Model](docs/risk-model.md)
- [Testing Strategy](docs/testing.md)
- [Architecture Decisions](docs/decisions/)
- [Deployment](docs/deployment.md) — placeholder; content not yet written

---

## Feature Specifications

The implementation is guided by the specifications in the `specs/` directory:

- [Route Planning](specs/001-route-planning.md)
- [Checkpoint and Weather Sampling](specs/002-checkpoint-weather-sampling.md)
- [Weather Risk Classification](specs/003-risk-classification.md)
- [Route Recommendation](specs/004-route-recommendation.md)
- [Map Visualization](specs/005-map-visualization.md)
- [Weather Heatmap](specs/006-weather-heatmap.md)
- [Validation and Reliability](specs/007-validation-and-reliability.md)

---

## Development Data

The foundation will use mocked route and weather data while provider integrations are being implemented.

Mocked data is used only for:

- Local development
- Unit and integration tests
- Demonstrations without provider credentials

Production code must use provider adapters and must not represent mocked weather data as live weather information.

---

## License

This project is provided for evaluation and demonstration purposes.
