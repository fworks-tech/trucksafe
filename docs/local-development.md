# Local Development

## Requirements

Install the following tools:

- Node.js 20 or newer
- Python 3.11 or newer
- Docker
- Docker Compose
- Git

## Clone the Repository

```bash
git clone https://github.com/<account>/<repository>.git
cd <repository>
```

## Environment Configuration

Create a local environment file:

```bash
cp .env.example .env
```

Example variables:

```env
DJANGO_SECRET_KEY=local-development-secret
DJANGO_DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1

POSTGRES_DB=truck_routing
POSTGRES_USER=truck_routing
POSTGRES_PASSWORD=truck_routing
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

REDIS_URL=redis://localhost:6379/0

ROUTING_API_BASE_URL=
ROUTING_API_TOKEN=

WEATHER_API_BASE_URL=
WEATHER_API_TOKEN=

VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_MAP_PUBLIC_TOKEN=
```

Do not commit `.env` files.

## Start Infrastructure

```bash
docker compose up -d postgres redis
```

Check running containers:

```bash
docker compose ps
```

## Backend Setup

```bash
cd apps/api
python -m venv .venv
```

Activate the virtual environment.

Linux/macOS:

```bash
source .venv/bin/activate
```

Windows:

```powershell
.venv\Scripts\activate
```

Install dependencies:

```bash
python -m pip install -e ".[dev]"
```

Apply migrations:

```bash
python manage.py migrate
```

Start the API:

```bash
python manage.py runserver
```

The backend will be available at:

```text
http://localhost:8000
```

## Frontend Setup

Open another terminal:

```bash
cd apps/web
npm install
npm run dev
```

The frontend will be available at:

```text
http://localhost:5173
```

## Useful Commands

### Frontend

```bash
npm run dev
npm run build
npm run test
npm run test:watch
npm run test:e2e
npm run lint
npm run format
```

### Backend

```bash
python manage.py runserver
python manage.py migrate
python manage.py makemigrations
pytest
ruff check .
ruff format --check .
mypy .
```

## Running with Docker

To start the local services:

```bash
docker compose up --build
```

To stop them:

```bash
docker compose down
```

To remove local volumes:

```bash
docker compose down -v
```

## Troubleshooting

### Database connection errors

Check that PostgreSQL is running:

```bash
docker compose ps postgres
```

Confirm the database environment variables match the Docker Compose configuration.

### Redis connection errors

Check Redis:

```bash
docker compose ps redis
```

Confirm that `REDIS_URL` is correct.

### Map is not rendering

Verify that:

- `VITE_MAP_PUBLIC_TOKEN` is configured.
- The token allows the local development domain.
- The browser console does not report token or style errors.

### External APIs are unavailable

Use mocked provider responses for local development and automated tests. The application should not require live provider calls for unit tests.