# mwc-api

FastAPI backend for the Mental Wellbeing Companion.

## Dev

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Migrations

```bash
uv run alembic upgrade head
```

## Tests

```bash
uv run pytest
```

## Operations

### Voice audio retention

Voice recordings auto-delete at 24h via:

```bash
cd apps/api
uv run python -m scripts.cleanup_voice_audio
```

Run hourly via cron or your hosting provider's scheduled jobs. Idempotent — safe
to run multiple times. Production deployments should configure a Supabase
`service_role` key for storage deletions (the script currently falls back to the
anon key as a placeholder).
