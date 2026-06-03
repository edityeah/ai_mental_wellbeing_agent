# Deployment — Oracle Cloud Always Free + Docker Compose

Single VM. All three services (web, API, voice worker) + Caddy reverse proxy as Docker containers. **$0/month forever** (modulo your Supabase usage, which stays on free tier for now).

Stack:

| Service | What | Where |
|---|---|---|
| **Caddy** | TLS termination + reverse proxy | Container on VM |
| **Web** (Next.js 15) | The app | Container on VM |
| **API** (FastAPI) | Backend | Container on VM |
| **Voice Worker** (Python) | LiveKit Agents worker | Container on VM |
| **Database** | Postgres | Supabase managed (free tier) |

## 1. Provision the VM on Oracle Cloud

1. Sign in to Oracle Cloud dashboard. Pick **Mumbai (ap-mumbai-1)** as region (top-right region selector). If Mumbai is full, try **Hyderabad (ap-hyderabad-1)**.
2. **Compute → Instances → Create Instance**.
3. Settings:
   - **Name**: `wellbeing-vm`
   - **Image & shape**: Click **Edit** next to "Image and shape"
     - Change shape to **Ampere** (the ARM A1 family). Shape: **VM.Standard.A1.Flex**.
     - Configure: **4 OCPUs, 24 GB RAM** (use all the free allowance).
     - Image: **Canonical Ubuntu 22.04** (or 24.04 if available).
   - **Networking**: leave the default VCN. Make sure **"Assign a public IPv4 address"** is checked.
   - **Add SSH keys**: Paste your public key (`cat ~/.ssh/id_ed25519.pub`). If you don't have one, generate: `ssh-keygen -t ed25519`.
   - **Boot volume**: 100 GB is fine (free tier covers 200 GB total).
4. Click **Create**.
5. If you get "Out of host capacity" → wait a few minutes and retry, or switch region to Hyderabad. Provisioning Mumbai can take a few attempts; it eventually works.
6. Once running, note the **Public IPv4 address** (something like `140.238.X.X`).

### Open the firewall at the cloud level

Oracle blocks all ports by default at the VCN security list (separate from the VM's own UFW). Open 80, 443, 22:

1. **Networking → Virtual Cloud Networks → vcn-2026... → Security Lists → Default Security List**.
2. **Add Ingress Rules**:
   - Source: `0.0.0.0/0`, Protocol: TCP, Dest Port: `22` (SSH)
   - Source: `0.0.0.0/0`, Protocol: TCP, Dest Port: `80` (HTTP / Caddy ACME)
   - Source: `0.0.0.0/0`, Protocol: TCP, Dest Port: `443` (HTTPS)
   - Source: `0.0.0.0/0`, Protocol: UDP, Dest Port: `443` (HTTP/3)
3. **Add Ingress Rules** for each → Save.

## 2. SSH in and bootstrap

```bash
ssh ubuntu@<VM_PUBLIC_IP>
sudo bash <(curl -sSL https://raw.githubusercontent.com/edityeah/ai_mental_wellbeing_agent/main/infra/bootstrap.sh)
```

The bootstrap script:
- Installs Docker + Docker Compose
- Enables UFW (firewall — allows 22, 80, 443)
- Hardens SSH (disables root/password auth)
- Installs fail2ban
- Creates a `deploy` user
- Clones the repo into `/opt/wellbeing`

When it finishes, log in as the deploy user:
```bash
ssh deploy@<VM_PUBLIC_IP>
cd /opt/wellbeing
```

## 3. Point DNS at the VM

At your domain registrar (or wherever `adityeah.ai` DNS lives — likely Cloudflare):

| Type | Host | Value |
|---|---|---|
| A | `wellbeing` | `<VM_PUBLIC_IP>` |
| A | `api` | `<VM_PUBLIC_IP>` |

If using Cloudflare for DNS: **set the proxy mode to DNS-only (gray cloud)**, not proxied (orange). Caddy needs to reach Let's Encrypt directly on port 80 for the HTTP-01 challenge. You can switch to proxied later if you want CF's DDoS protection.

Wait 5–10 min for DNS to propagate. Verify:
```bash
dig +short wellbeing.adityeah.ai
dig +short api.adityeah.ai
# Both should return the VM's public IP.
```

## 4. Set secrets

On the VM:
```bash
cd /opt/wellbeing
cp .env.production.example .env
nano .env
```

Fill in every value. Reference your local `apps/api/.env` for the matching values (Anthropic, Supabase, LiveKit, Deepgram, Cartesia, VOICE_WORKER_SECRET).

For `DATABASE_URL`, use the Supabase **transaction pooler** (port 6543) for runtime:
```
postgresql+asyncpg://postgres.<ref>:<pwd>@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

## 5. Run migrations

If you haven't migrated the Supabase prod DB yet (from local was already done earlier), skip this. Otherwise:

```bash
# Use the SESSION pooler (port 5432) for migrations, NOT the transaction pooler.
docker run --rm \
  -e DATABASE_URL='postgresql+asyncpg://postgres.<ref>:<pwd>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres' \
  -e ANTHROPIC_API_KEY=dummy -e ANTHROPIC_COMPANION_MODEL=x -e ANTHROPIC_HAIKU_MODEL=x \
  -e SUPABASE_URL='https://<ref>.supabase.co' -e SUPABASE_ANON_KEY=dummy \
  -e SUPABASE_JWT_AUDIENCE=authenticated \
  -e SUPABASE_JWKS_URL='https://<ref>.supabase.co/auth/v1/.well-known/jwks.json' \
  -v $(pwd):/app -w /app/apps/api \
  python:3.12-slim \
  bash -c "pip install -q uv && uv sync --no-dev && uv run alembic upgrade head"
```

## 6. Boot everything

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes ~5 minutes (downloads images, installs Python deps, builds Next.js). Subsequent rebuilds are faster due to layer caching.

Watch logs:
```bash
docker compose -f docker-compose.prod.yml logs -f
```

You're looking for:
- **Caddy**: `serving initial configuration` and TLS cert acquisition for both domains.
- **API**: `Application startup complete.`
- **Web**: `Ready in ...`
- **Voice worker**: `registered worker {"agent_name": "companion", ...}`

If Caddy can't get a cert, the most likely cause is DNS not propagating yet — wait 5 more min and check `dig +short wellbeing.adityeah.ai` again.

## 7. Supabase Auth redirect

Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://wellbeing.adityeah.ai`
- **Redirect URLs**: add `https://wellbeing.adityeah.ai/auth/callback`

## 8. Smoke test

In a private/incognito browser:
1. Open `https://wellbeing.adityeah.ai` — should load with valid HTTPS cert.
2. Sign in via magic link (from `Wellbeing <wellbeing@adityeah.ai>`).
3. Walk through onboarding → land in chat.
4. Send a text message → should stream a response.
5. Place a voice call → should connect, agent greets, transcripts appear in the thread.
6. End the call → Care Plan card appears.
7. Check `/insights` and `/profile`.

## Ongoing operations

### Deploy a new version (after `git push`):

```bash
ssh deploy@<VM_IP>
cd /opt/wellbeing
./infra/deploy.sh
```

Or set up GitHub Actions to do this automatically on push to `main`. Ask if you want this — I'll wire it.

### Watch logs

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f voice-worker
docker compose -f docker-compose.prod.yml logs -f web
```

### Restart a single service

```bash
docker compose -f docker-compose.prod.yml restart api
```

### Update the OS (do this monthly)

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot   # if a kernel update was applied
```

### Check resource usage

```bash
docker stats        # live CPU/mem per container
free -h             # system memory
df -h               # disk
```

## Backups

Supabase free tier includes **daily backups with 7-day retention** — handled for you. Profile/conversation/recap data is safe.

The VM's local Docker volumes (`caddy_data`, `caddy_config`) only contain TLS certs — Caddy can re-acquire them at any time, so no backup needed.

## Common gotchas

- **Cert provisioning fails on first boot**: DNS isn't propagated yet. Wait. Caddy retries automatically.
- **"Out of host capacity" on Oracle**: known issue with Always Free Ampere. Keep retrying; switch to Hyderabad if Mumbai stays full.
- **Voice worker crashes on boot**: check `LIVEKIT_URL` includes `wss://`; check all 4 API keys (Anthropic, Deepgram, Cartesia, LiveKit) are non-empty in `.env`.
- **`Failed to fetch` errors in browser console**: `CORS_ALLOWED_ORIGINS` doesn't match the web origin exactly. Must be `https://wellbeing.adityeah.ai` (no trailing slash).
- **Magic link redirects to `localhost:3000` in prod**: Supabase Auth URL Configuration wasn't updated (step 7).
- **Container restart loop**: `docker compose -f docker-compose.prod.yml logs <service>` will show why. Most often it's a missing env var.

## Security checklist (post-deploy)

- [ ] Rotate Supabase DB password (it was pasted in chat history).
- [ ] Confirm SSH password auth is disabled: `sudo grep PasswordAuthentication /etc/ssh/sshd_config` → should say `no`.
- [ ] Confirm UFW is active: `sudo ufw status` → should show `Status: active`, with only 22/80/443.
- [ ] Set up an uptime monitor (UptimeRobot free) on `https://wellbeing.adityeah.ai` — they'll email you if the site goes down.
- [ ] Enable Supabase 2FA on your account.
- [ ] Lock down Oracle Cloud account with 2FA.
