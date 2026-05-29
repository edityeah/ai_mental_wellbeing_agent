# 🍃 Mental Wellbeing Companion

> *"The actual problem isn't efficiency. It's happiness."*

A mobile-first daily companion for mental wellbeing. The user opens it on their phone whenever they need a steady presence — to be heard, to slow down, to think out loud — and the agent remembers them across sessions, learns their patterns, and adapts.

This is a **clean rebuild** of the [original Streamlit PoC](https://github.com/edityeah/ai_mental_wellbeing_agent/tree/7a66aff) — moving from a one-shot form into a real persistent product with multi-user accounts, a structured-profile memory model, tiered crisis safety, and a streaming chat UX.

---

## ✨ What's in the box (Slice 1 — shipped)

| | |
|---|---|
| **Always-on chat** | Persistent thread per conversation; user-managed multiple threads (ChatGPT-style sidebar / mobile drawer). |
| **One Companion persona** | A single warm voice — not a corporate "assistant". Specialist agents (Assessment / Action / Follow-up) are hidden behind the Companion for later slices. |
| **Living memory** | Structured user profile (stressors, coping strategies, sleep patterns, support system, goals) updated automatically after each conversation segment. |
| **Tiered crisis safety** | Every user message runs through a Haiku 4.5 classifier *in parallel* with the Companion. Acute risk → hard-coded crisis card with India helplines, no LLM-generated advice. |
| **Mobile-first PWA** | Installable on iOS/Android home screen. Sage-on-cream "calm" palette. Streaming reply UX. |
| **Multi-user from day one** | Supabase magic-link auth. 50 msg/day per-user rate limit. Per-day usage counters. |
| **37 backend tests + Playwright E2E + classifier eval harness** | TDD all the way down. |

## 🚧 Roadmap

| Slice | Status | What |
|---|---|---|
| **1. Foundation + Chat** | ✅ shipped | Everything above |
| **2. Voice calling agent** | 🚧 next | LiveKit-powered WebRTC voice — same Companion + safety + profile pipeline |
| 3. Specialist team | planned | Make the hidden specialists visible; saved Action Plans |
| 4. Mood + Journal tracking | planned | Daily quick-log + long-form journal |
| 5. Weekly recap | planned | Sunday auto-generated recap card |

---

## 🛠️ Stack

- **Frontend:** Next.js 15 (App Router, TypeScript), Tailwind, `@supabase/ssr`, PWA (manifest + service worker)
- **Backend:** FastAPI (Python 3.12), async SQLAlchemy 2, Alembic, structlog, `sse-starlette`
- **LLM:** Anthropic — Claude Sonnet 4.6 for the Companion, Haiku 4.5 for safety + profile updates + auto-titles
- **DB + Auth:** Supabase (managed Postgres + Auth)
- **Tooling:** pnpm workspaces, `uv`, Docker Compose for local Postgres, Playwright

## 📁 Layout

```
apps/
├── web/                   # Next.js mobile-first PWA
└── api/                   # FastAPI backend
docs/superpowers/
├── specs/                 # design docs, per slice
└── plans/                 # implementation plans, per slice
scripts/dev.sh             # one-command local boot
```

## 🚀 Quickstart

Prerequisites: Node ≥ 20.11, pnpm ≥ 9, Python 3.12 with `uv`, Docker, a free Supabase project, an Anthropic API key.

```bash
cp .env.example apps/api/.env       # fill in your keys
# .env.local in apps/web/ for NEXT_PUBLIC_* mirrors
./scripts/dev.sh
```

Open http://localhost:3000 — sign up via magic link, start a conversation.

Full setup (Supabase trigger, migration to Supabase Postgres, etc.) is in [`docs/superpowers/plans/2026-05-28-slice-1-foundation-chat.md`](docs/superpowers/plans/2026-05-28-slice-1-foundation-chat.md) → Task 2.1.

## 🧪 Tests

```bash
# Backend (37 tests)
cd apps/api && uv run pytest

# Frontend typecheck
pnpm --filter @mwc/web typecheck

# Playwright smoke (web must be running)
pnpm --filter @mwc/web e2e

# Classifier accuracy on 10 curated cases (needs Anthropic key)
cd apps/api && uv run python -m scripts.classifier_eval
```

## 🏗️ Architecture notes

- **Source-agnostic Companion**: the `companion.stream_reply()` signature takes `source: "text" | "voice"`. Slice 2's voice integration will plug into the same function without rewrites.
- **Parallel safety + companion**: the safety classifier (Haiku) and the Companion stream (Sonnet) run **concurrently**. The speculative companion starts with `risk="none"`; if safety lands as `elevated`, it's restarted with the elevated-mode prompt; if `acute`, it's cancelled and the crisis card takes over.
- **Background work** (auto-title, profile updater) runs *after* the SSE response closes so it never extends user-visible latency.

## ⚠️ Mental health disclaimer

This app is a supportive tool, not a substitute for professional mental health care. If you or someone you know is in crisis, please contact:

- 📞 **iCall** (free, confidential): 9152987821
- 📞 **Vandrevala Foundation** (24/7): 1860-2662-345
- 📞 **AASRA** (suicide prevention): 9820466726
- 📞 **Emergency psychiatric care**: 14416
- 📞 **National mental health support**: 1800-599-0019

## ✍️ Author

Built by **Aditya Chaudhari** ([@adityacbcc](https://www.linkedin.com/in/adityacbcc/)). I build AI agents that solve real human problems, not productivity ones.

📰 Deep-dive writeups: [news.adityeah.in](https://news.adityeah.in/)
