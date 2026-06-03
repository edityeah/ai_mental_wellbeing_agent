# Deployment — Cloudflare Tunnel + Mac (zero monthly cost)

This is the deployment path the production app currently runs on. A MacBook at home runs all three services as Docker containers; Cloudflare Tunnel exposes them to the public internet without opening any ports on your router.

| | |
|---|---|
| **Cost** | $0/month (you pay your home electricity + ISP, which you pay anyway) |
| **Always-on requirement** | Mac must stay on. Sleep = site down. |
| **Latency** | Mumbai-edge via Cloudflare → ~20-50ms from anywhere in India |
| **TLS** | Cloudflare handles cert provisioning + renewal at the edge |
| **Public ports on Mac** | Zero (tunnel is outbound only) |

If you'd rather pay a few dollars and not babysit, this same `docker-compose.tunnel.yml` (with minor port tweaks) runs identically on Render, Railway, DigitalOcean, Hetzner, etc.

---

## Prerequisites

- Mac with **Docker Desktop** installed and running
- Domain managed by Cloudflare (zone added, name servers pointed at Cloudflare)
- Accounts: Supabase, Anthropic, LiveKit Cloud, Deepgram, Cartesia
- Supabase production Postgres provisioned (any free-tier project works)
- `cloudflared` CLI installed via Homebrew

```bash
brew install cloudflared
```

---

## 1. Migrate the production Postgres schema

From your laptop, against your Supabase project's **session pooler** (port 5432 — DDL needs session mode):

```bash
cd apps/api
DATABASE_URL='postgresql+asyncpg://postgres.<ref>:<pwd>@aws-<region>.pooler.supabase.com:5432/postgres' \
  uv run alembic upgrade head
```

You should see migrations `0001 → 0006` apply. Verify the table list:

```bash
psql 'postgresql://postgres.<ref>:<pwd>@aws-<region>.pooler.supabase.com:5432/postgres' \
  -c "\dt public.*"
```

Expected: `users`, `conversations`, `messages`, `user_profiles`, `voice_sessions`, `usage_daily`, `mood_checkins`, `alembic_version`.

## 2. Set up the Cloudflare Tunnel

### Authenticate

```bash
cloudflared tunnel login
```

Opens your browser, asks you to select the zone you want the tunnel attached to. Click your domain → Authorize. A cert is saved to `~/.cloudflared/cert.pem`.

### Create the tunnel

```bash
cloudflared tunnel create wellbeing
```

Prints something like:

```
Tunnel credentials written to /Users/<you>/.cloudflared/<UUID>.json
Created tunnel wellbeing with id <UUID>
```

Note the UUID — you'll need it in the config below.

### Write the routing config

```bash
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: <UUID-from-above>
credentials-file: /Users/<you>/.cloudflared/<UUID-from-above>.json

ingress:
  - hostname: wellbeing.<yourdomain>
    service: http://localhost:3000
  - hostname: api.<yourdomain>
    service: http://localhost:8000
  - service: http_status:404
EOF
```

### Point DNS at the tunnel

```bash
cloudflared tunnel route dns wellbeing wellbeing.<yourdomain>
cloudflared tunnel route dns wellbeing api.<yourdomain>
```

Each prints "Added CNAME ... which will route to this tunnel". Done.

## 3. Configure environment

Build the production `.env` at the repo root. The template is at `.env.production.example`:

```bash
cp .env.production.example .env
nano .env
```

Fill in every value. Critical ones:

- `DATABASE_URL` → Supabase **transaction pooler** (port 6543) for app traffic
- `NEXT_PUBLIC_API_URL=https://api.<yourdomain>`
- `CORS_ALLOWED_ORIGINS=https://wellbeing.<yourdomain>`
- All Anthropic/LiveKit/Deepgram/Cartesia keys
- `VOICE_WORKER_SECRET` — any 32+ char random string

## 4. Bring up the stack

```bash
docker compose -f docker-compose.tunnel.yml up -d --build
```

First build is ~5 minutes (Next.js standalone build + Python deps). Subsequent rebuilds are faster.

Verify each container:

```bash
docker compose -f docker-compose.tunnel.yml ps
```

You should see:
- `web` → Up (port `127.0.0.1:3000`)
- `api` → Up, healthy (port `127.0.0.1:8000`)
- `voice-worker` → Up (no port; outbound to LiveKit)

If the worker isn't registering, `docker compose logs voice-worker` will show why (usually missing API key or wrong `LIVEKIT_URL`).

## 5. Run the tunnel as a persistent service

We use a launchd User Agent so the tunnel auto-starts at login and self-restarts if it crashes:

Create `~/Library/LaunchAgents/com.adityeah.cloudflared-wellbeing.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.adityeah.cloudflared-wellbeing</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/cloudflared</string>
        <string>tunnel</string>
        <string>run</string>
        <string>wellbeing</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>/Users/<you></string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>/Users/<you></string>
    <key>StandardOutPath</key>
    <string>/Users/<you>/Library/Logs/wellbeing/cloudflared.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/<you>/Library/Logs/wellbeing/cloudflared.err.log</string>
</dict>
</plist>
```

Then:

```bash
mkdir -p ~/Library/Logs/wellbeing
launchctl load ~/Library/LaunchAgents/com.adityeah.cloudflared-wellbeing.plist
launchctl list | grep cloudflared
```

Tunnel is now resilient to crashes and Mac reboots.

## 6. Mac sleep settings

- **System Settings → Battery → Options** → "Prevent automatic sleeping on power adapter when the display is off" → **On**
- For MacBook lid-closed operation without an external monitor, install [Amphetamine](https://apps.apple.com/in/app/amphetamine/id937984704) (free, App Store) and set it to keep Mac awake while running.

## 7. Docker Desktop autostart

- Docker Desktop → Settings → General → **"Start Docker Desktop when you log in"** → ✅

Containers have `restart: unless-stopped` in `docker-compose.tunnel.yml`, so they auto-resume whenever Docker Desktop starts.

## 8. Supabase Auth URL Configuration

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://wellbeing.<yourdomain>`
- **Redirect URLs**: add `https://wellbeing.<yourdomain>/auth/callback`

Without this, magic-link emails from production redirect to localhost.

## 9. Smoke test

In a private/incognito window:

1. Open `https://wellbeing.<yourdomain>` — should load with valid TLS cert.
2. Sign in via magic link (email from your branded sender via Resend).
3. Walk onboarding → land on chat.
4. Send a text message → token-by-token reply.
5. Place a voice call → connects, agent greets, live transcripts in the thread.
6. End the call → Care Plan card appears.

## Updating the deployed app

```bash
cd ~/Documents/Mental\ Wellbeing\ Agent
git pull
docker compose -f docker-compose.tunnel.yml up -d --build
```

That's it. Docker rebuilds only changed services. Cloudflare Tunnel is independent of the containers — won't bounce.

## Watching logs

```bash
docker compose -f docker-compose.tunnel.yml logs -f api
docker compose -f docker-compose.tunnel.yml logs -f web
docker compose -f docker-compose.tunnel.yml logs -f voice-worker
tail -f ~/Library/Logs/wellbeing/cloudflared.log
```

## Common gotchas

- **Site loads 502 right after deploy**: the web container is still starting (Next.js standalone init takes ~2-3 sec). Wait a few seconds.
- **API container "unhealthy"**: check `docker compose logs api` — usually `DATABASE_URL` malformed or wrong Supabase password.
- **Voice worker reconnect loop**: `LIVEKIT_URL` must start with `wss://`, and the four AI keys must all be set.
- **CORS errors in browser console**: `CORS_ALLOWED_ORIGINS` doesn't match the web origin exactly. Must be `https://wellbeing.<yourdomain>`, no trailing slash, no path.
- **Magic link goes to localhost in prod**: Supabase Auth URL Configuration not updated.
- **Mac shell exports empty `ANTHROPIC_API_KEY=`**: this silently overrides the `.env` file (Docker Compose precedence). Unset before running compose, or trust the `env_ignore_empty=True` in the API's settings.

## Security checklist

- [ ] Rotate Supabase DB password if it's ever been pasted in a chat / log / screenshot
- [ ] Supabase 2FA enabled
- [ ] Cloudflare 2FA enabled
- [ ] Set up an uptime monitor (UptimeRobot free) on `https://wellbeing.<yourdomain>`
- [ ] Periodically review `~/Library/Logs/wellbeing/cloudflared.err.log` for unusual errors
