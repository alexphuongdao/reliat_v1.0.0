# syntax=docker/dockerfile:1
# reliat — FastAPI service container.
# Built for Railway (or any Docker-friendly PaaS). The runtime binds to
# the platform-provided $PORT.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies. Includes the [postgres] extra so a Neon /
# managed-Postgres DATABASE_URL works out of the box, and [xls] for the
# one-off real-data ingestion script.
COPY pyproject.toml ./
COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic
RUN pip install ".[postgres,xls]"

# Drop into a non-root user.
RUN useradd --create-home --shell /bin/bash reliat \
    && chown -R reliat:reliat /app
USER reliat

EXPOSE 8000

# Railway injects $PORT; default to 8000 for `docker run` locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
