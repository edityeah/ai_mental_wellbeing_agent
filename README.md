# Wellbeing

> A calm space to be heard.

A mobile-first daily companion for mental wellbeing. Multi-user app with text chat, voice calling, a progressive profile that remembers you across sessions, and a Care Plan you can save as PDF.

**Live**: [wellbeing.adityeah.ai](https://wellbeing.adityeah.ai) *(self-hosted on a MacBook via Cloudflare Tunnel — be patient if it's down)*

This is a clean rebuild of an [earlier Streamlit PoC](https://github.com/edityeah/ai_mental_wellbeing_agent/tree/7a66aff) — moving from a one-shot form into a real persistent product.

---

## What it does

| | |
|---|---|
| **Streaming text chat** | Token-by-token typewriter, multi-conversation, per-user. |
| **Voice calling** | Real-time WebRTC voice with multilingual STT/TTS. Live transcripts stream into the chat thread during the call so you can read what was said. |
| **Mood check-in** | One-tap emoji scale (1–5) each day; injected into the Companion's prompt so it calibrates tone. |
| **Progressive profile** | Six structured buckets — stressors, coping strategies, sleep, support system, goals, notable events — populated automatically from conversations, also editable on `/profile`. |
| **End-of-conversation Care Plan** | Haiku-backed summary at the end of substantive sessions: what we talked about, what's working for you, small things to try, when to check back in. Persists, downloadable as PDF. |
| **Insights page** | Accumulated profile + recent Care Plans across every conversation. |
| **Image attachments** | Drop screenshots / photos into chat — Claude vision reads them. |
| **Tiered crisis safety** | Every message runs a Haiku risk classifier in parallel with the Companion. Acute risk → hard-coded crisis card with verified India helplines (KIRAN, iCall, AASRA, Vandrevala, etc). |
| **Onboarding** | 5-step first-run flow that seeds the profile so the Companion isn't cold on turn one. |
| **Multilingual** | Companion follows whatever language the user uses (Hindi, English, Hinglish). Voice STT is `nova-3 multi`; TTS uses a multilingual Cartesia voice. |
| **PWA** | Installable on home screen. Sage-on-cream palette. |

## Architecture

```
┌──────────────┐  HTTPS + SSE        ┌─────────────────┐
│  Next.js     │ ──────────────────► │  FastAPI        │
│  (apps/web)  │ ◄────────────────── │  (apps/api)     │
└──────────────┘                     └────────┬────────┘
                                              │ Postgres
                                              ▼
                          ┌──────────────────────────────────┐
                          │  Supabase  (Auth + managed PG)   │
                          └──────────────────────────────────┘

       ┌────────────────────────────────────────────┐
       │  Voice (LiveKit Cloud + WebRTC)            │
       │                                             │
       │  Browser ◄──RTC──► LiveKit ◄──worker──►    │
       │                              │             │
       │  Voice worker (apps/voice-   │             │
       │  worker) wraps Deepgram STT, │             │
       │  Cartesia TTS, Anthropic LLM │             │
       │  inside livekit-agents.       │             │
       └────────────────────────────────────────────┘
```

**Three services**, all containerized:

- **`apps/web`** — Next.js 15 (App Router, TS, Tailwind). SSE streaming chat, voice call UI, profile/insights/onboarding/legal pages, mobile drawer.
- **`apps/api`** — FastAPI (async SQLAlchemy 2). Chat SSE, voice token mint, profile + mood + insights + onboarding endpoints, Alembic migrations.
- **`apps/voice-worker`** — Python LiveKit Agents worker. Custom `CompanionLLM` subclass routing through the same safety classifier + companion prompt the text path uses.

**External services**: Supabase (auth + Postgres), Anthropic (Claude Sonnet 4.6 + Haiku 4.5), LiveKit Cloud (WebRTC), Deepgram (STT), Cartesia (TTS), Resend (SMTP for branded magic-link emails).

## Repository layout

```
.
├── apps/
│   ├── api/              FastAPI service
│   │   ├── app/          Routers, agents, schemas, db models, settings
│   │   └── alembic/      Migrations (0001 → 0006)
│   ├── web/              Next.js 15 app
│   │   ├── app/          Route segments
│   │   │   ├── (app)/    Authenticated routes (chat, profile, insights, onboarding)
│   │   │   └── (legal)/  Public legal pages + crisis resources
│   │   ├── components/   Shell, chat, voice, threads, brand, ui
│   │   └── lib/          API client, supabase, cn, sse
│   └── voice-worker/     LiveKit Agents Python worker
├── docs/
│   ├── DEPLOY.md         Deployment (Cloudflare Tunnel path)
│   └── superpowers/      Original design specs + implementation plans
├── docker-compose.yml          Local dev (Postgres only)
├── docker-compose.tunnel.yml   Production (web + api + worker)
├── package.json                Monorepo root
├── pnpm-workspace.yaml         pnpm workspaces config
└── scripts/dev.sh              Convenience script for local dev
```

## Running locally

### Prerequisites
- Node 20+, pnpm 9+
- Python 3.12+, [uv](https://github.com/astral-sh/uv)
- Docker Desktop
- Accounts (free tier of each is fine to start): [Supabase](https://supabase.com), [Anthropic](https://console.anthropic.com), [LiveKit Cloud](https://livekit.io/cloud), [Deepgram](https://deepgram.com), [Cartesia](https://cartesia.ai)

### Setup
```bash
git clone https://github.com/edityeah/ai_mental_wellbeing_agent
cd ai_mental_wellbeing_agent

# 1. Start the local Postgres
docker compose up -d

# 2. Web deps
pnpm install

# 3. API + worker deps
cd apps/api && uv sync && cd ../voice-worker && uv sync && cd ../..

# 4. Configure env — copy template, fill in real values
cp .env.example apps/api/.env

# 5. Run migrations
cd apps/api && uv run alembic upgrade head && cd ../..

# 6. Bring everything up (web, api, voice worker)
./scripts/dev.sh
```

Then open `http://localhost:3000` and sign in via magic link.

### Or, run services individually
```bash
pnpm dev:web      # Next.js on :3000
pnpm dev:api      # FastAPI on :8000
pnpm dev:voice    # Voice worker (registers with LiveKit Cloud)
```

## Deployment

The currently-running production setup uses **Cloudflare Tunnel** to expose a Mac at home as the public host — zero monthly cost. Full walkthrough in [docs/DEPLOY.md](docs/DEPLOY.md).

If you'd rather run on Render, Fly, Railway, or a paid VPS, all three services are already Dockerized (`apps/*/Dockerfile`). The compose files double as references for how the services are wired.

## Design docs

The original Slice 1 + Slice 2 design specs and implementation plans are preserved at `docs/superpowers/specs/` and `docs/superpowers/plans/`. They explain *why* the data model + agent topology look the way they do.

## Crisis disclaimer

**Wellbeing is not a clinical tool, not a medical device, and not for emergencies.** It's a software companion for self-reflection and general emotional support. If you're in crisis: call **112** (India emergency) or one of the helplines at [`/crisis-resources`](https://wellbeing.adityeah.ai/crisis-resources). The disclaimer page at [`/legal/disclaimer`](https://wellbeing.adityeah.ai/legal/disclaimer) goes into detail.

## License

Personal project. No license granted for commercial use, redistribution, or model training. Contact me if you want to discuss something different.

---

Built with deliberate care by [@edityeah](https://github.com/edityeah).
