# Production image for the TruckSafe Django API.
#
# Designed for AWS App Runner (container listens on 0.0.0.0 and honors the
# injected PORT), but any container host works. No credentials are baked
# in; all secrets arrive as environment variables (see docs/deployment.md).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=false

WORKDIR /srv/app

# Dependencies first so code changes do not invalidate the pip layer.
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# Application code (see .dockerignore for what stays out).
COPY . .

EXPOSE 8000

# App Runner injects PORT; default to 8000 for plain `docker run`.
# Migrations run at boot against the ephemeral SQLite file, which is fine
# for the demo slice; a persistent database replaces this later.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 60"]
