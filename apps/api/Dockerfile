# Production image for the FastAPI app.
#
# Build context should be the repo root so Alembic migrations + the app
# module are both available. Run from repo root with:
#   docker build -f apps/api/Dockerfile -t mwc-api .
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# uv is the package manager used in dev. Use it in prod too so lockfile
# resolution is byte-for-byte identical to what was tested locally.
RUN pip install --no-cache-dir uv==0.4.27

WORKDIR /app

# Copy lockfile + manifest first so dependency layer caches across rebuilds.
COPY apps/api/pyproject.toml apps/api/uv.lock* /app/
RUN uv sync --frozen --no-dev || uv sync --no-dev

# Copy the app + Alembic migrations.
COPY apps/api/app /app/app
COPY apps/api/alembic.ini /app/alembic.ini
COPY apps/api/alembic /app/alembic

# Run migrations on container start, then launch uvicorn.
# Bind to 0.0.0.0:$PORT — most hosts (Fly, Railway, Render) inject PORT.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
