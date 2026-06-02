# Deployment

Three deployable units. Pick a target per unit; the recommended pairings are below.

| Unit                 | Recommended host          | Why                                                |
|----------------------|----------------------------|-----------------------------------------------------|
| `apps/web` (Next.js) | **Vercel**                | First-class Next.js support, free tier covers MVP.  |
| `apps/api` (FastAPI) | **Fly.io** or **Railway** | Long-running ASGI, websockets, Postgres in-region.  |
| `apps/voice-worker`  | **Fly.io** or **Railway** | Long-running Python with native deps (Silero VAD).  |
| Postgres             | **Supabase managed PG**   | Auth is already there; one place to look.           |
| LiveKit              | **LiveKit Cloud**         | Already in use.                                     |

## Prerequisites

1. Supabase project with `Auth` enabled (magic-link or whatever you prefer).
2. LiveKit Cloud project — note the `wss://` URL, API key, and secret.
3. Anthropic API key with both Claude Sonnet 4.6 and Haiku 4.5 access.
4. Deepgram API key (`nova-3` model access).
5. Cartesia API key + the voice ID you want (multilingual `sonic-2`).

## 1. Database

Apply the schema to your production Postgres:

```bash
cd apps/api
DATABASE_URL='postgresql+asyncpg://...:6543/postgres' uv run alembic upgrade head
```

Use the pgbouncer URL (port 6543) on Supabase for prod traffic.

## 2. API (FastAPI)

Build the image from the repo root so Alembic + the app module are both in scope:

```bash
docker build -f apps/api/Dockerfile -t mwc-api .
```

Deploy to Fly:

```bash
cd apps/api
fly launch --image mwc-api --no-deploy
fly secrets set $(grep -v '^#' .env.production | xargs)
fly deploy
```

The image runs `alembic upgrade head` on every boot — no separate migration step needed.

### Required env vars

See `apps/api/.env.production.example`. Critical: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `SUPABASE_*`, `LIVEKIT_*`, `VOICE_WORKER_SECRET`.

### CORS

Update `allow_origins` in `apps/api/app/main.py` to your deployed web origin (e.g. `https://wellbeing.yourdomain.com`) before the first prod deploy.

## 3. Voice worker

```bash
docker build -f apps/voice-worker/Dockerfile -t mwc-voice .
```

Same secrets as the API (it imports from `app.settings` and shares the database). It connects out to LiveKit Cloud — no inbound ports required.

Deploy to Fly:

```bash
cd apps/voice-worker
fly launch --image mwc-voice --no-deploy
# Same secrets as the API:
fly secrets set $(grep -v '^#' ../api/.env.production | xargs)
fly deploy
```

The worker registers under `agent_name=companion`. The API mints LiveKit tokens with `RoomAgentDispatch(agent_name="companion")` — so as long as both services point at the same LiveKit project, dispatch is automatic.

## 4. Web

```bash
cd apps/web
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_API_URL production
vercel deploy --prod
```

## Smoke test

After all three are deployed:

1. `curl https://api.your-domain.com/api/v1/health` → `{"ok": true}`.
2. Open `https://wellbeing.your-domain.com`, sign in via magic link.
3. Send one text message — should stream a response.
4. Place a voice call — should connect within 2s, transcripts should appear in the chat thread.
5. End the call — a Care Plan card should appear within ~2s.
6. Open `/insights` — profile and recap should be there.

## Observability (optional next step)

- **Sentry**: add `sentry-sdk[fastapi]` to `apps/api/pyproject.toml` and `init()` in `app/main.py`. Same for the worker.
- **Logs**: Fly and Railway both stream stdout; piping to a Logtail / Axiom is one env var.
- **Cost alerts**: Anthropic and LiveKit both have usage dashboards — set budget alarms before going public.
