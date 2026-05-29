# Mental Wellbeing Companion

Mobile-first daily mental-wellbeing companion. Rebuild of the original Streamlit PoC ([archived in `repo/`, gitignored]) into a multi-user app with persistent chat memory, tiered safety, and (in Slice 2) voice calls.

## Layout

- `apps/web` — Next.js 15 (App Router, TS) — mobile-first PWA
- `apps/api` — FastAPI (Python 3.12) — chat orchestration + Claude calls
- `packages/` — shared TypeScript packages (slice 2+)
- `docs/superpowers/specs/` — design docs per slice
- `docs/superpowers/plans/` — implementation plans per slice

## Slice plan

1. **Slice 1** — Foundation + Chat *(in progress)*
2. Slice 2 — Voice calling agent (LiveKit)
3. Slice 3 — Specialist team (Assessment / Action / Follow-up)
4. Slice 4 — Mood + Journal tracking
5. Slice 5 — Weekly recap

## Prerequisites

- Node ≥ 20.11, pnpm ≥ 9
- Python 3.12 with `uv`
- Docker (for local Postgres)
- A Supabase project (free tier is fine) — see `apps/api/README.md` for setup
- An Anthropic API key

## Quickstart

```bash
cp .env.example .env       # edit with your keys
docker compose up -d postgres
pnpm install
# Backend
cd apps/api && uv sync && uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
# Frontend (separate terminal)
cd apps/web && pnpm dev
```

Open http://localhost:3000.
