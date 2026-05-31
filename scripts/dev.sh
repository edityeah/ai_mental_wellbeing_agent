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

VOICE_PID=
if [[ "${START_VOICE:-0}" == "1" ]]; then
  echo "→ starting voice-worker"
  ( cd apps/voice-worker && uv run python -m worker.main dev ) &
  VOICE_PID=$!
else
  echo "ℹ Voice worker is OFF. Enable with: START_VOICE=1 ./scripts/dev.sh"
  echo "   (Requires LIVEKIT_*, DEEPGRAM_API_KEY, CARTESIA_API_KEY in apps/api/.env)"
fi

cleanup() {
  echo "→ stopping"
  kill $API_PID $WEB_PID ${VOICE_PID:-} 2>/dev/null || true
}
trap cleanup EXIT

wait
