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
