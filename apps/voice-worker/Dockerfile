# Build context is the repo root (see docker-compose.yml).
FROM python:3.12-slim

# uv for fast deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY apps/api /app/apps/api
COPY apps/voice-worker /app/apps/voice-worker

WORKDIR /app/apps/voice-worker
RUN uv sync --no-dev

CMD ["uv", "run", "python", "-m", "worker.main", "start"]
