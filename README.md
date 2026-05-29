# Mental Wellbeing Companion

Mobile-first daily mental-wellbeing companion. Rebuild of the original Streamlit PoC (archived in `repo/`, gitignored) into a multi-user app with persistent chat memory, tiered safety, and (in Slice 2) voice calls.

## Layout

- `apps/web` — Next.js 15 (App Router, TS) — mobile-first PWA
- `apps/api` — FastAPI (Python 3.12) — chat orchestration + Claude calls
- `packages/` — shared TypeScript packages (slice 2+)
- `docs/superpowers/specs/` — design docs per slice
- `docs/superpowers/plans/` — implementation plans per slice

## Slice plan

1. **Slice 1** — Foundation + Chat *(this implementation)*
2. Slice 2 — Voice calling agent (LiveKit)
3. Slice 3 — Specialist team (Assessment / Action / Follow-up)
4. Slice 4 — Mood + Journal tracking
5. Slice 5 — Weekly recap

## Prerequisites

- Node ≥ 20.11, pnpm ≥ 9
- Python 3.12 with `uv`
- Docker (for local Postgres)
- A Supabase project (free tier is fine) — see `docs/superpowers/specs/2026-05-28-slice-1-foundation-chat-design.md` § 9 + Task 2.1 of the plan
- An Anthropic API key

## Quickstart

```bash
cp .env.example .env       # edit with your keys
./scripts/dev.sh           # starts postgres, applies migrations, runs api + web
```

Open http://localhost:3000.

## Tests

```bash
# Backend
cd apps/api && uv run pytest

# Frontend
cd apps/web && pnpm typecheck
pnpm --filter @mwc/web e2e   # requires the dev server running

# Classifier accuracy (uses real Anthropic API)
cd apps/api && uv run python -m scripts.classifier_eval
```

## Mental health disclaimer

This app is a supportive tool, not a substitute for professional mental health care. If you or someone you know is in crisis, please contact:

- 📞 iCall: 9152987821
- 📞 Vandrevala Foundation: 1860-2662-345
- 📞 AASRA: 9820466726
- 📞 Emergency psychiatric care: 14416
- 📞 National support: 1800-599-0019
