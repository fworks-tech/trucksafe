# ADR-001: Application Technology Stack

## Status

Accepted

## Context

The project requires a React and Django application that can provide interactive route visualization, weather analysis, route recommendations, and a maintainable backend.

## Decision

Use the following stack:

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
- PostgreSQL
- PostGIS
- Redis

### Testing

- Vitest
- Testing Library
- Playwright
- pytest
- Hypothesis

## Rationale

This stack provides:

- Strong typing.
- Fast local development.
- Mature map rendering capabilities.
- Clear separation between domain logic and infrastructure.
- Good testing support.
- Support for geospatial data.
- A practical path to deployment.

## Consequences

Positive consequences:

- The frontend and backend have clear responsibilities.
- TypeScript and OpenAPI can share API contracts.
- PostGIS supports future geospatial features.
- Redis supports caching and asynchronous processing.

Trade-offs:

- The project has more than one language.
- API contracts must be maintained carefully.
- Map and weather providers introduce external dependencies.