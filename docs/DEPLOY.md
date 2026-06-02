# Deployment — Render + Supabase

Three Render services + Supabase managed Postgres. ~$21/mo on Render.

| Service | Render type | Source |
|---|---|---|
| `mwc-api` | Web Service (Docker) | `apps/api/Dockerfile` |
| `mwc-voice-worker` | Background Worker (Docker) | `apps/voice-worker/Dockerfile` |
| `mwc-web` | Web Service (Docker) | `apps/web/Dockerfile` |
| Database | Supabase managed Postgres | (existing project) |

## 1. Migrate the Supabase Postgres schema

From local, against your prod DB (use **session pooler** on port 5432 — DDL needs session mode):

```bash
cd apps/api
DATABASE_URL='postgresql+asyncpg://postgres.PROJECT_REF:PASSWORD@aws-X-REGION.pooler.supabase.com:5432/postgres' \
  uv run alembic upgrade head
```

Verify all tables exist:

```bash
psql 'postgresql://postgres.PROJECT_REF:PASSWORD@aws-X-REGION.pooler.supabase.com:5432/postgres' \
  -c "\dt public.*"
```

You should see: `alembic_version`, `conversations`, `messages`, `mood_checkins`, `usage_daily`, `user_profiles`, `users`, `voice_sessions`.

## 2. Create services on Render via Blueprint

The repo has a `render.yaml` at the root that defines all three services.

1. Render dashboard → **New +** → **Blueprint**.
2. Connect the GitHub repo `edityeah/ai_mental_wellbeing_agent`.
3. Render reads `render.yaml` and lists 3 services. Click **Apply**.
4. Render creates the services and shows the "Set environment variables" screen for each. You set secrets there (next section).

## 3. Set secrets (per service)

### `mwc-api`

Use the **transaction pooler URL** (port 6543) for runtime traffic — high concurrency, short-lived queries.

| Key | Value |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres.PROJECT_REF:PASSWORD@aws-X-REGION.pooler.supabase.com:6543/postgres` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SUPABASE_URL` | `https://veaqoiloywilmnporkkf.supabase.co` |
| `SUPABASE_ANON_KEY` | (from Supabase Project Settings → API → anon public key) |
| `SUPABASE_JWKS_URL` | `https://veaqoiloywilmnporkkf.supabase.co/auth/v1/.well-known/jwks.json` |
| `LIVEKIT_URL` | `wss://mental-wellbeing-wkx7tjo0.livekit.cloud` |
| `LIVEKIT_API_KEY` | `API...` |
| `LIVEKIT_API_SECRET` | `secret...` |
| `VOICE_WORKER_SECRET` | (the random 32+ char string used locally) |
| `CORS_ALLOWED_ORIGINS` | `https://wellbeing.adityeah.ai` (or your prod web origin) |

### `mwc-voice-worker`

Same as API, plus:

| Key | Value |
|---|---|
| `DEEPGRAM_API_KEY` | `...` |
| `CARTESIA_API_KEY` | `...` |
| `API_BASE_URL` | Internal hostname Render gives the API service (e.g. `https://mwc-api.onrender.com`) |

### `mwc-web`

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://veaqoiloywilmnporkkf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (same as API) |
| `NEXT_PUBLIC_API_URL` | The API's public URL — `https://mwc-api.onrender.com` initially, then your custom `https://api.adityeah.ai` once DNS is wired |

> Important: `NEXT_PUBLIC_*` vars get baked into the client JS at *build* time. Changing them requires a redeploy of the web service.

## 4. First deploy

In the Render dashboard each service will trigger an automatic build. Watch logs:

- `mwc-api` should boot, run `alembic upgrade head` (no-op if you already migrated), and start uvicorn on `:8000`. Health check at `/api/v1/health` should return `{"ok": true}`.
- `mwc-voice-worker` should register with LiveKit Cloud — look for `"registered worker" {"agent_name": "companion", ...}` in the logs.
- `mwc-web` should build Next.js, output the standalone bundle, and start `node server.js` on `:3000`.

Verify each:

```bash
curl https://mwc-api.onrender.com/api/v1/health   # → {"ok":true}
curl -I https://mwc-web.onrender.com               # → 200
# Voice worker has no public URL — check the service's Logs tab.
```

## 5. Custom domain `wellbeing.adityeah.ai`

In `mwc-web` → Settings → Custom Domain → add `wellbeing.adityeah.ai`. Render shows a CNAME to set at your DNS host. Add it. Wait 5–10 min for cert provisioning.

Optionally also add `api.adityeah.ai` to `mwc-api` for a clean API URL. If you do:
- Update `NEXT_PUBLIC_API_URL` on `mwc-web` to `https://api.adityeah.ai`.
- Redeploy `mwc-web` (so the new URL is baked into the client bundle).
- Update `CORS_ALLOWED_ORIGINS` on `mwc-api` to include the new web origin.

## 6. Supabase Auth redirect

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://wellbeing.adityeah.ai`
- **Redirect URLs**: add `https://wellbeing.adityeah.ai/auth/callback`

Without this, magic links from production won't redirect back to your app.

## 7. Smoke test

1. Open `https://wellbeing.adityeah.ai` (private/incognito window, signed-out).
2. Sign in via magic link — email lands from `Wellbeing <wellbeing@adityeah.ai>`.
3. Click the link → land on `/onboarding` → walk through 5 steps.
4. Send a text message — should stream a response within ~2s.
5. Place a voice call — should connect, agent should greet, transcripts should appear in the thread.
6. End the call — Care Plan card should appear within 1–2s.
7. Open `/insights` and `/profile` — your seeded data should be there.

## 8. Rotate the DB password

In any chat session where I (the AI assistant) had access to your DB URL, **rotate the password** afterwards:

- Supabase → Project Settings → Database → Reset database password.
- Update `DATABASE_URL` on `mwc-api` and `mwc-voice-worker` in Render.
- Redeploy both.

## Common gotchas

- **`mwc-web` build fails missing NEXT_PUBLIC_API_URL**: those vars must be set in Render *before* the first build, because they're baked into the bundle at build time, not runtime.
- **`mwc-voice-worker` keeps crashing**: check `LIVEKIT_URL` includes the `wss://` prefix; check Anthropic / Deepgram / Cartesia keys are set.
- **CORS errors in browser**: `CORS_ALLOWED_ORIGINS` on `mwc-api` must exactly match the web's origin (no trailing slash). Multiple origins are comma-separated.
- **Magic link redirects to `localhost:3000` in prod**: Supabase Auth URL Configuration wasn't updated. Fix in step 6.

## Observability (future)

- **Sentry**: add `sentry-sdk[fastapi]` to `apps/api/pyproject.toml`, init in `app/main.py`. Same for the worker. Frontend: `@sentry/nextjs`.
- **Cost alerts**: Anthropic + LiveKit both have usage dashboards. Set budget alarms before going public.
