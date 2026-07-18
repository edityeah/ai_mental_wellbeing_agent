# Cloudflare Worker — "Wellbeing is resting" page

Sits in front of `wellbeing.adityeah.ai` (and `api.adityeah.ai`). When
the Mac is asleep and the tunnel is down, users see a warm, on-brand
"Wellbeing is taking a breather" page instead of Cloudflare's generic
`Bad Gateway`.

- **HTML browsers** get the styled page.
- **API/JSON requests** get `{ "error": "origin_asleep", ... }` 503 —
  so the web app's client fetches fail cleanly, don't parse 200KB of
  HTML into their state.

Source: [`cloudflare-worker.js`](./cloudflare-worker.js) — one file, no
build step.

## Deploy (~2 min, no CLI needed)

1. Cloudflare dashboard → **Workers & Pages** (left rail) → **Create**.
2. Pick **Create Worker**. Name it `wellbeing-resting`. Click **Deploy**
   (it deploys a "Hello world" — that's fine, we replace it next).
3. On the worker's overview page, click **Edit code** (top right).
4. Delete the "Hello world" starter. Paste the entire contents of
   `infra/cloudflare-worker.js` from this repo.
5. Click **Save and Deploy**.

### Attach it to your domain

Still in the worker's overview:

6. **Settings → Triggers → Routes → Add route**.
   - Route: `wellbeing.adityeah.ai/*`
   - Zone: `adityeah.ai`
   - Save.
7. Add a second route:
   - Route: `api.adityeah.ai/*`
   - Zone: `adityeah.ai`
   - Save.

That's it. The Worker now runs on every request to those hostnames.

## How to verify it works

**When your Mac is on:**
- Visit `https://wellbeing.adityeah.ai` — normal site loads.
- The Worker adds ~10-30ms of edge latency. Unnoticeable.

**When your Mac is asleep:**
- Visit `https://wellbeing.adityeah.ai` — resting page appears.
- Curl `https://api.adityeah.ai/api/v1/health` — returns:
  ```json
  { "error": "origin_asleep", "message": "...", "retry_after_seconds": 90 }
  ```

**To force-test right now** (without sleeping your Mac): stop the Docker
containers — `docker compose -f docker-compose.tunnel.yml stop` — then
visit the site. Rest page should appear. Bring containers back with
`docker compose -f docker-compose.tunnel.yml start`.

## Updating the page

Just paste new JS into the Worker's **Edit code** view and hit
**Save and Deploy**. No rebuilds, no redeploys of your app.

## Cost

Cloudflare Workers free plan: **100,000 requests/day**. This app is
nowhere near that.

## Undo / remove

Dashboard → the worker → **Settings → General → Delete**. Or remove
the routes in **Triggers** to keep the worker but stop it intercepting.
