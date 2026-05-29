#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ starting postgres"
docker compose up -d postgres

echo "→ waiting for postgres to be healthy"
until docker exec mwc-postgres pg_isready -U mwc -d mwc > /dev/null 2>&1; do
  sleep 1
done

echo "→ applying migrations"
( cd apps/api && uv run alembic upgrade head )

echo "→ starting api on :8000 and web on :3000"
( cd apps/api && uv run uvicorn app.main:app --reload --port 8000 ) &
API_PID=$!
( cd apps/web && pnpm dev ) &
WEB_PID=$!

trap "echo '→ stopping'; kill $API_PID $WEB_PID 2>/dev/null || true" EXIT

wait
