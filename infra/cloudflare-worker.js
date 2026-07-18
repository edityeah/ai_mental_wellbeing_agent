/**
 * Cloudflare Worker — "Wellbeing is resting" page.
 *
 * Sits in front of wellbeing.adityeah.ai/* and api.adityeah.ai/*. On
 * every request it tries the origin (the Cloudflare Tunnel → Mac). If
 * the origin responds with a real page, we pass it through. If the
 * tunnel is down (Mac asleep, docker stopped, etc.) or the origin
 * returns 5xx, we return a warm "resting" page (or JSON for API
 * requests).
 *
 * Deploy: Cloudflare dashboard → Workers & Pages → Create Worker →
 * paste this file → save → add routes:
 *   wellbeing.adityeah.ai/*   → this worker
 *   api.adityeah.ai/*         → this worker
 */

export default {
  async fetch(request) {
    // Timeout the origin fast — if the Mac is asleep we want the
    // resting page to appear in seconds, not tens of seconds.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const originResponse = await fetch(request, {
        signal: controller.signal,
        // Don't follow redirects here; let the caller (browser) do it.
        redirect: "manual",
      });
      clearTimeout(timeoutId);

      // If Cloudflare's tunnel edge itself returned 5xx (origin
      // unreachable, tunnel disconnected, tunnel error), swap in the
      // resting page. Otherwise pass through — including 4xx, which
      // are the app's own responses, not infra failure.
      if (originResponse.status >= 500 && originResponse.status < 600) {
        return restingResponse(request);
      }
      return originResponse;
    } catch (err) {
      clearTimeout(timeoutId);
      return restingResponse(request);
    }
  },
};

function restingResponse(request) {
  const url = new URL(request.url);
  const accept = request.headers.get("accept") || "";
  const wantsHtml = accept.includes("text/html");
  const isApiHost = url.hostname.startsWith("api.");

  // API host: return JSON, not HTML. The frontend already handles
  // fetch failures gracefully; giving it JSON is friendlier than a
  // 200KB HTML dump.
  if (isApiHost || !wantsHtml) {
    return new Response(
      JSON.stringify({
        error: "origin_asleep",
        message:
          "Wellbeing is temporarily unavailable. The origin machine is asleep.",
        retry_after_seconds: 90,
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "90",
        },
      },
    );
  }

  const nowUtc = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
  const html = RESTING_HTML.replace("__TIMESTAMP__", nowUtc);

  return new Response(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "90",
    },
  });
}

// Inline HTML so the Worker is one file. Sage-on-cream palette matches
// the app itself. Auto-refreshes every 90s via <meta refresh>. Small
// countdown animation for visual feedback.
const RESTING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="90">
<title>Wellbeing — taking a breather</title>
<style>
:root {
  --sage: #4A5D4F;
  --sage-dark: #3A4D3F;
  --sage-light: #6B7A6E;
  --cream: #FAF7F2;
  --cream-edge: #EDE7DA;
  --ink: #2a2e2a;
  --mute: #8a8f87;
  --accent: #C9A85F;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: var(--cream);
  color: var(--ink);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  line-height: 1.6;
}
main {
  max-width: 560px;
  width: 100%;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--sage-light);
  margin-bottom: 28px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.leaf {
  width: 22px; height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, #5C7060, #3A4D3F);
  position: relative;
  overflow: hidden;
}
.leaf svg {
  position: absolute;
  inset: 3px;
  width: 16px; height: 16px;
}
h1 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 40px;
  font-weight: 400;
  color: var(--sage-dark);
  line-height: 1.1;
  margin: 0 0 24px;
  letter-spacing: -0.01em;
}
h1 em {
  font-style: italic;
  color: var(--sage);
}
p {
  color: var(--ink);
  margin: 0 0 18px;
  font-size: 16px;
  max-width: 46ch;
}
p.mute {
  color: var(--mute);
  font-size: 15px;
}
.status {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 20px;
  font-family: ui-monospace, "SF Mono", "Menlo", Consolas, monospace;
  font-size: 12px;
  border-top: 1px solid var(--cream-edge);
  border-bottom: 1px solid var(--cream-edge);
  padding: 16px 0;
  margin: 36px 0 28px;
}
.status dt { color: var(--mute); }
.status dd { margin: 0; color: var(--sage); font-weight: 500; }
.status dd.warn { color: var(--accent); }
.meanwhile-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--mute);
  margin-bottom: 10px;
}
.row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--cream-edge);
  font-size: 15px;
}
.row:last-child { border-bottom: none; }
.row .k {
  color: var(--mute);
  font-style: italic;
}
.row .v { color: var(--ink); }
.row .v .sub {
  display: block;
  color: var(--mute);
  font-size: 13px;
  margin-top: 3px;
  font-style: normal;
}
a { color: var(--sage); text-decoration: underline; text-underline-offset: 3px; }
a:hover { color: var(--sage-dark); }
.progress {
  margin-top: 32px;
  height: 3px;
  background: var(--cream-edge);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}
.progress-bar {
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 0%;
  background: var(--sage);
  animation: fill 90s linear infinite;
}
@keyframes fill {
  from { width: 0%; }
  to { width: 100%; }
}
.retry-note {
  font-size: 12px;
  color: var(--mute);
  margin-top: 10px;
  font-family: ui-monospace, monospace;
  display: flex;
  align-items: center;
  gap: 6px;
}
.retry-note b { color: var(--sage); font-weight: 500; }
@media (max-width: 480px) {
  h1 { font-size: 30px; }
  body { padding: 24px 20px; }
  .row { grid-template-columns: 1fr; gap: 2px; }
  .row .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
}
</style>
</head>
<body>
<main>
  <div class="brand">
    <div class="leaf" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 18 C 6 10, 12 4, 20 4 C 20 12, 14 18, 6 18 Z" fill="#FAF7F2"/>
        <path d="M7 17 C 12 12, 16 8, 19 5" stroke="#5C7060" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
      </svg>
    </div>
    <span>Wellbeing</span>
    <span style="opacity:.4">·</span>
    <span style="text-transform:none;letter-spacing:0.02em;font-style:italic">a calm space to be heard</span>
  </div>

  <h1>The Companion is<br><em>taking a breather</em>.</h1>

  <p>Wellbeing runs on a MacBook at home behind a Cloudflare tunnel — no cloud server, no monthly bill. Right now that MacBook is asleep.</p>

  <p class="mute">Nothing's broken and nothing needs redeploying. The site returns the moment the Mac wakes up.</p>

  <dl class="status">
    <dt>origin</dt>       <dd class="warn">unreachable</dd>
    <dt>tunnel</dt>       <dd>cloudflared</dd>
    <dt>edge</dt>         <dd>cloudflare</dd>
    <dt>checked</dt>      <dd>__TIMESTAMP__</dd>
  </dl>

  <div class="meanwhile-label">Meanwhile</div>
  <div>
    <div class="row">
      <div class="k">Email</div>
      <div class="v">
        <a href="mailto:aditya.c@convegenius.ai">aditya.c@convegenius.ai</a>
        <span class="sub">Say "wake up Wellbeing" or ask for a walkthrough — usually back within the hour.</span>
      </div>
    </div>
    <div class="row">
      <div class="k">Or wait</div>
      <div class="v">
        This page will retry every 90 seconds.
        <span class="sub">You can also just refresh — nothing on this end is caching a stale copy.</span>
      </div>
    </div>
  </div>

  <div class="progress" aria-hidden="true">
    <div class="progress-bar"></div>
  </div>
  <div class="retry-note">next retry in <b><span id="countdown">90</span>s</b></div>

  <script>
    let s = 90;
    const el = document.getElementById('countdown');
    setInterval(() => {
      s = s > 0 ? s - 1 : 90;
      el.textContent = s;
    }, 1000);
  </script>
</main>
</body>
</html>`;
