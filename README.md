# Weather-Aware Truck Routing

A full-stack web application that helps truck drivers compare route options based on weather conditions, load weight, travel time, and checkpoint-level risk analysis.

The application generates route alternatives, samples weather conditions along each route using estimated arrival times, classifies operational risk, and recommends the safest route according to the defined business rules.

## Overview

The user provides:

- Origin
- Destination
- Departure date and time
- Load weight

The application then:

1. Generates up to three route options using a routing API.
2. Creates checkpoints every 10, 25, or 50 miles.
3. Calculates the estimated arrival time at each checkpoint.
4. Retrieves hourly weather forecasts for each checkpoint.
5. Classifies weather risk based on wind, rain, and snow.
6. Applies truck load restrictions.
7. Recommends the best route.
8. Displays routes, checkpoints, risks, ETAs, summaries, and a weather heatmap.
9. Provides a 0–48 hour forecast slider for the trip corridor.

## Features

- Interactive route comparison
- Up to three route alternatives
- Checkpoint-based weather analysis
- Wind, rain, and snow risk classification
- Load-sensitive route restrictions
- Route recommendation based on risk and travel time
- Estimated arrival time for every checkpoint
- Interactive map visualization
- Weather risk heatmap
- Forecast timeline from 0 to 48 hours
- Responsive user interface
- Input validation on frontend and backend
- External API failure handling
- Automated tests and API contract validation

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- Mapbox GL JS

### Backend

- Python
- Django
- Django REST Framework
- Pydantic or DRF serializers
- httpx
- Celery
- Redis

### Data

- PostgreSQL
- PostGIS

### Testing and Quality

- Vitest
- React Testing Library
- Playwright
- pytest
- pytest-django
- Hypothesis
- Ruff
- mypy
- ESLint
- Prettier
- OpenAPI validation

### Infrastructure

- Docker
- Docker Compose
- GitHub Actions
- Terraform
- AWS or another compatible cloud provider

## Repository Structure

```text
.
├── apps/
│   ├── api/                 # Django REST API
│   └── web/                 # React frontend
├── packages/
│   └── contracts/           # OpenAPI specification and shared schemas
├── specs/                   # Feature specifications
├── docs/                    # Architecture and technical documentation
├── infra/                   # Docker and infrastructure configuration
├── scripts/                 # Development and validation scripts
├── .github/
│   └── workflows/           # CI/CD workflows
├── docker-compose.yml
├── Makefile
├── README.md
└── .env.example
```

## Requirements

Before starting the project, install:

- Node.js 20+
- Python 3.12+
- Docker and Docker Compose
- Git

External API credentials may be required for:

- Routing and geocoding
- Weather forecasting
- Map rendering

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/<your-account>/<your-repository>.git
cd <your-repository>
```

### 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Example configuration:

```env
# Application
DJANGO_SETTINGS_MODULE=config.settings.development
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
POSTGRES_DB=truck_routing
POSTGRES_USER=truck_routing
POSTGRES_PASSWORD=truck_routing
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379/0

# Routing provider
ROUTING_API_BASE_URL=
ROUTING_API_TOKEN=

# Weather provider
WEATHER_API_BASE_URL=
WEATHER_API_TOKEN=

# Frontend
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_MAP_PUBLIC_TOKEN=
```

Never commit `.env` files or private API credentials.

### 3. Start infrastructure services

```bash
docker compose up -d postgres redis
```

### 4. Install backend dependencies

```bash
cd apps/api

python -m venv .venv
source .venv/bin/activate
```

On Windows:

```powershell
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run migrations:

```bash
python manage.py migrate
```

Start the Django API:

```bash
python manage.py runserver
```

The API will be available at:

```text
http://localhost:8000
```

### 5. Install frontend dependencies

In another terminal:

```bash
cd apps/web
npm install
npm run dev
```

The frontend will be available at:

```text
http://localhost:5173
```

## Available Commands

### Frontend

```bash
npm run dev        # Start the development server
npm run build      # Type-check and build the application
npm run preview    # Preview the production build
npm run test       # Run unit and component tests
npm run test:watch # Run tests in watch mode
npm run test:e2e   # Run Playwright end-to-end tests
npm run lint       # Run ESLint
npm run format      # Format files with Prettier
```

### Backend

```bash
python manage.py runserver       # Start the development server
python manage.py migrate         # Apply database migrations
python manage.py makemigrations  # Create migrations
pytest                           # Run backend tests
ruff check .                     # Run Python linting
ruff format --check .            # Check formatting
mypy .                           # Run static type checking
```

## Risk Classification

Risk is calculated independently at each checkpoint.

### Wind

| Condition | Risk |
|---|---|
| `< 25 mph` | Low |
| `25–34 mph` | Moderate |
| `35–44 mph` | High |
| `45–54 mph` | Severe |
| `≥ 55 mph` | No Travel |

### Rain

| Condition | Risk |
|---|---|
| `< 0.10 in/hr` | Low |
| `0.10–0.25 in/hr` | Moderate |
| `0.25–0.50 in/hr` | High |
| `0.50–1.00 in/hr` | Severe |
| `> 1.00 in/hr` | No Travel |

### Snow

| Condition | Risk |
|---|---|
| `< 0.5 in/hr` | Low |
| `0.5–1.0 in/hr` | Moderate |
| `1.0–2.0 in/hr` | High |
| `2.0–3.0 in/hr` | Severe |
| `> 3.0 in/hr` | No Travel |

When multiple weather conditions apply, the highest severity is used:

```text
No Travel > Severe > High > Moderate > Low
```

## Load Rules

The following load-specific rules are applied after the weather classification:

- Wind speed of `≥ 55 mph` results in `No Travel` for every load.
- Wind speed from `45` to `54 mph` with a load greater than `30,000 lb` results in `No Travel`.
- Wind speed from `35` to `44 mph` with a load greater than `40,000 lb` results in `Severe`.

Load rules can increase the risk level but never reduce an existing risk classification.

## Route Recommendation

Routes are ranked using the following priority order:

1. Fewest severe-weather miles
2. Fewest high-risk miles
3. Lowest average risk score
4. Shortest travel time

The recommendation is deterministic and follows a lexicographical comparison of these metrics.

Example:

```text
Route ranking key:

(
  severe_miles,
  high_miles,
  average_risk_score,
  duration_seconds
)
```

## Checkpoints and ETA

Checkpoints are generated along the route geometry using the selected interval:

- 10 miles
- 25 miles
- 50 miles

The estimated arrival time at a checkpoint is calculated using the route distance and duration:

```text
checkpoint ETA =
departure time +
(checkpoint distance / total route distance) × route duration
```

Weather conditions are retrieved using the checkpoint coordinates and estimated arrival time.

## API

### Create a route plan

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

### Retrieve a route plan

```http
GET /api/v1/route-plans/{id}
```

### Retrieve weather grid data

```http
GET /api/v1/route-plans/{id}/weather-grid?offset_hours=12
```

The `offset_hours` parameter supports values from `0` to `48`.

### Health check

```http
GET /api/v1/health
```

### Readiness check

```http
GET /api/v1/ready
```

The complete API contract is available at:

```text
packages/contracts/openapi.yaml
```

## Testing Strategy

The project uses multiple testing levels.

### Unit tests

Business logic tests cover:

- Weather thresholds
- Boundary values
- Load rules
- Risk precedence
- Checkpoint generation
- ETA calculation
- Route recommendation
- Weather normalization

### Integration tests

Integration tests cover:

- Routing provider responses
- Weather provider responses
- Provider timeouts
- Rate limits
- Invalid external payloads
- Cache behavior
- Database persistence

### End-to-end tests

The primary user journey is tested with Playwright:

1. Enter origin and destination.
2. Select departure date and time.
3. Enter load weight.
4. Submit the form.
5. Verify route alternatives.
6. Verify the recommended route.
7. Inspect checkpoints and risk levels.
8. Change the forecast slider.
9. Verify the heatmap update.

Run the complete test suite with:

```bash
make test
```

## Security

The application follows these security practices:

- Backend validation for every request
- Strict CORS configuration
- Rate limiting for route planning requests
- HTTPS in deployed environments
- Secrets stored outside source control
- Private API credentials kept server-side
- External provider timeouts and retries
- Structured error responses
- No stack traces exposed to clients
- Dependency and container vulnerability scanning
- Input size and range limits
- SSRF protection through an allowlist of external hosts

For additional information, see:

```text
SECURITY.md
```

## External API Resilience

External API integrations are implemented behind provider interfaces.

This allows the application to:

- Replace a provider without changing domain logic
- Mock external services during tests
- Cache routing and weather responses
- Handle timeouts and temporary failures
- Validate provider responses before processing
- Return meaningful partial or service errors

The core risk and recommendation engines do not depend directly on external API clients.

## Development Principles

- Specification-driven development
- Domain logic isolated from framework code
- OpenAPI as the API contract
- Validation at both frontend and backend boundaries
- Deterministic business rules
- Small, testable services
- Explicit units and UTC timestamps
- Secure-by-default configuration
- Performance-conscious map rendering
- Documentation maintained with the implementation

## Definition of Done

A feature is considered complete when:

- Its specification is documented.
- Acceptance criteria are implemented.
- API schemas are updated.
- Unit tests are included.
- Integration tests are included where needed.
- End-to-end coverage exists for critical user flows.
- Error handling is implemented.
- Security implications are reviewed.
- Documentation is updated.
- CI checks pass.

## Deployment

The application can be deployed using separate frontend and backend services.

A production deployment should include:

- React application served through a CDN
- Django API behind HTTPS
- Managed PostgreSQL database with PostGIS
- Managed Redis instance
- Secret manager
- Health checks
- Centralized logs
- Error monitoring
- Automated database backups

Deployment configuration is located in:

```text
infra/
```

## Documentation

- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Local Development](docs/local-development.md)
- [Deployment](docs/deployment.md)
- [Risk Model](docs/risk-model.md)
- [Testing](docs/testing.md)
- [Architecture Decisions](docs/decisions/)

## Feature Specifications

The implementation is guided by the specifications in the `specs/` directory:

- [Route Planning](specs/001-route-planning.md)
- [Checkpoint and Weather Sampling](specs/002-checkpoint-weather-sampling.md)
- [Weather Risk Classification](specs/003-risk-classification.md)
- [Route Recommendation](specs/004-route-recommendation.md)
- [Map Visualization](specs/005-map-visualization.md)
- [Weather Heatmap](specs/006-weather-heatmap.md)
- [Validation and Reliability](specs/007-validation-and-reliability.md)

## License

This project is provided for evaluation and demonstration purposes.