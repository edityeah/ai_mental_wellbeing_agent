# Slice 1 — Foundation + Chat: Design Document

**Status:** Draft for review
**Author:** Aditya Chaudhari, with Claude
**Date:** 2026-05-28
**Project:** Mental Wellbeing Agent — clean rewrite from the original Streamlit PoC at https://github.com/edityeah/ai_mental_wellbeing_agent into a mobile-first, multi-user daily companion app.

---

## 1. Where this fits

This is **Slice 1 of 5**. The full rebuild is sliced as follows; each slice gets its own spec → implementation plan → ship.

| Slice | Scope |
|---|---|
| **1. Foundation + Chat** *(this doc)* | Auth, DB, mobile-first responsive PWA, always-on text chat with the Companion, structured-profile memory, tiered safety classifier, rate limits. |
| 2. Voice calling agent | LiveKit Agents wraps the Companion + safety + profile logic from this slice for real-time voice calls. |
| 3. Specialist team | Hidden Assessment / Action / Follow-up specialists dispatched behind the Companion; saved Action Plans. |
| 4. Mood + Journal tracking | Quick-log and journal entries, surfaced into Companion context. |
| 5. Weekly recap | Sunday cron job generates a recap card. |

After Slice 1 ships, a user can sign up, open the app on their phone, have an ongoing text conversation with the Companion that remembers them across sessions, and be safely redirected if they express acute crisis signals.

## 2. Locked decisions (carried in from brainstorming)

These are settled. Do not re-litigate during implementation.

- **Daily loop:** always-on persistent chat thread (not morning/evening ritual, not on-demand only).
- **Memory model:** structured profile (jsonb) + chat history with rolling summary. Profile is updated by a background job after each conversation segment.
- **Agent architecture:** one user-facing "Companion" persona. Specialists are deferred to slice 3 — but the code shape is designed so adding them later does not require a rewrite.
- **Deployment model:** multi-user with accounts (real product, not a single-user local app).
- **LLM provider:** Anthropic only. Claude Sonnet 4.6 for the Companion. Claude Haiku 4.5 for the safety classifier and the background profile updater. No fallback provider in slice 1.
- **Crisis safety:** tiered detection → redirect. Every user message runs the safety classifier *before* the Companion. `acute` → hard-coded crisis card (no LLM-generated coping tips). `elevated` → Companion runs with an elevated-mode prompt. `none` → normal flow.
- **Rate limit:** 50 messages/day per user, hard cap. After 50 the UI shows a "come back tomorrow" message.
- **Threading:** user-managed multiple threads (ChatGPT-style sidebar on desktop, drawer on mobile). Auto-titled from the first user message; editable.
- **UI direction:** "calm + spacious" — sage primary (#4A5D4F) on cream (#FAF7F2), Georgia serif for headings, system sans for body, generous whitespace.
- **Form factor:** mobile-first responsive web, installable as a PWA. Same web app scales up to desktop. No native (React Native) for v1.
- **Stack:** Next.js 15 (App Router, TypeScript) + FastAPI (Python 3.12) + Postgres. Supabase Auth (email + magic link). Drizzle ORM on the TS side, SQLAlchemy on the Python side, both talking to the same schema. Anthropic SDK direct — no LangGraph, no AG2.

## 3. Scope

### In scope for Slice 1

- Sign up + log in (email + magic link via Supabase Auth).
- Mobile-first responsive PWA shell (installable, offline-shell only, no offline message sending).
- Conversation list, user-managed: **list / create / rename / switch threads**. Delete/archive is deferred to a later slice.
- Single-thread text chat with streamed responses (SSE).
- Safety classifier runs on every user message before the Companion.
- Companion persona with system prompt that incorporates the user's living profile snapshot.
- Profile updater (background) runs every 5 assistant replies and on idle.
- 50 messages/day per-user rate limit, with UI feedback.
- Crisis card (static, hard-coded copy with India helplines 1800-599-0019 and 14416 + 5-4-3-2-1 grounding script).
- Basic observability: structured logs for every chat turn, classifier decision, profile update.

### Out of scope (deferred to later slices)

- Voice calls (slice 2).
- Specialist agents (slice 3) — but the Companion's call site is shaped to accept optional specialist outputs without restructuring.
- Mood/sleep/stress logging UI (slice 4) — but the profile schema reserves a place for it.
- Journal entries (slice 4).
- Weekly recap (slice 5).
- Saved action plans as artifacts (slice 3).
- Multi-language support (English only in v1).
- Push notifications.
- Analytics / experimentation framework.

## 4. High-level architecture

```
                ┌─────────────────────────────────────────────────────┐
   Phone /      │  Next.js 15 (App Router, TypeScript)                │
   Desktop      │  - PWA shell + service worker                       │
   browser ─────┤  - Supabase JS client (auth)                        │
                │  - Chat UI (streamed via SSE)                       │
                │  - Threads drawer / sidebar                         │
                └────────────────────┬────────────────────────────────┘
                                     │   HTTPS + Supabase JWT
                                     ▼
                ┌─────────────────────────────────────────────────────┐
                │  FastAPI (Python 3.12)                              │
                │                                                     │
                │   ┌─── auth middleware (verifies Supabase JWT) ─┐   │
                │   ▼                                             │   │
                │   /chat (SSE)   /conversations   /me  /health   │   │
                │           │                                     │   │
                │           ▼                                     │   │
                │   ┌──────────────────────────────────────────┐  │   │
                │   │  agents/                                 │  │   │
                │   │   - safety.py     (Haiku classifier)     │  │   │
                │   │   - companion.py  (Sonnet, streamed)     │  │   │
                │   │   - profile.py    (Haiku, background)    │  │   │
                │   └──────────────────────────────────────────┘  │   │
                │           │                                     │   │
                │           ▼                                     │   │
                │   ┌──────────────────────────────────────────┐  │   │
                │   │  db/ (SQLAlchemy)                        │  │   │
                │   └──────────────────────────────────────────┘  │   │
                └────────────────┬─────────────────┬──────────────────┘
                                 │                 │
                                 ▼                 ▼
                          ┌──────────────┐  ┌──────────────┐
                          │   Postgres   │  │  Anthropic   │
                          │  (Supabase)  │  │     API      │
                          └──────────────┘  └──────────────┘
```

Two-app monorepo. Locally one `docker-compose up` runs everything: Postgres + Next.js + FastAPI. In production each app is deployed independently (Vercel for the Next.js app, Fly.io or Railway for FastAPI, Supabase for Postgres + Auth).

## 5. Data model

Five tables. Schema is designed to support **all five slices**, so column names are chosen to be source-agnostic and feature-agnostic where possible.

### users
Mirror of `auth.users` from Supabase. Populated by a Postgres trigger when a new auth user is created.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | matches `auth.users.id` |
| `email` | text unique | |
| `display_name` | text nullable | optional. Captured at signup if provided; **no edit UI in slice 1**. |
| `created_at` | timestamptz | |

### conversations
Each user can have multiple threads.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk → users.id | |
| `title` | text | auto-generated from the first user message via a cheap Haiku summarize call; editable |
| `created_at` | timestamptz | |
| `last_msg_at` | timestamptz | used to order the thread list |
| `archived_at` | timestamptz nullable | reserved for slice 3+ |

Indexes: `(user_id, last_msg_at DESC)` for the sidebar query.

### messages
Holds both user and assistant turns. Designed to also hold voice transcripts in slice 2 without schema change.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `conversation_id` | uuid fk | |
| `role` | text | `'user' \| 'assistant' \| 'system_crisis'` |
| `source` | text | `'text' \| 'voice'` — defaults to `'text'` in slice 1; slice 2 will write `'voice'` for transcribed turns |
| `content` | text | |
| `risk_level` | text nullable | `'none' \| 'elevated' \| 'acute'` — only set on user-role rows (classifier output) |
| `created_at` | timestamptz | |
| `token_count` | int | for cost tracking + when to trigger summarization |

Indexes: `(conversation_id, created_at)`.

### user_profiles
One row per user. Holds the structured living profile and the rolling summary.

| column | type | notes |
|---|---|---|
| `user_id` | uuid pk fk | |
| `profile` | jsonb | structured fields, schema below |
| `summary` | text | natural-language rolling summary of the user's situation, ≤ ~500 tokens |
| `last_processed_msg_id` | uuid nullable | watermark for the profile updater so it's idempotent |
| `updated_at` | timestamptz | |

**`profile` JSON shape:**

```json
{
  "stressors": [
    {"label": "work deadlines", "first_seen": "2026-05-12T...", "intensity": 4}
  ],
  "coping_strategies": [
    {"label": "evening walks", "effective": true},
    {"label": "doomscrolling at night", "effective": false}
  ],
  "support_system": ["partner", "weekly therapist", "older sister"],
  "sleep_patterns": {"typical_hours": 6.0, "issues": ["trouble falling asleep"]},
  "goals": [
    {"label": "less screen time after 9pm", "set_at": "2026-05-20T..."}
  ],
  "notable_events": [
    {"label": "started new job", "date": "2026-04-01"}
  ]
}
```

Every field is optional. The profile updater is allowed to add to arrays, remove obsolete items, or no-op. Schema is enforced by a pydantic model at write time.

### usage_daily
Per-user per-day counters, for rate limiting and cost visibility.

| column | type | notes |
|---|---|---|
| `user_id` | uuid fk | |
| `date` | date | UTC; UI may display in user's local time |
| `text_msg_count` | int default 0 | incremented on every user message |
| `voice_seconds` | int default 0 | reserved for slice 2 |
| `tokens_in` | int default 0 | informational |
| `tokens_out` | int default 0 | informational |

Primary key: `(user_id, date)`. The 50-msg cap is enforced before invoking the Companion.

### Migrations

- **Alembic** on the Python side is the source of truth for schema. Drizzle in the TS app is read-only for slice 1 (no writes from Next.js — all DB writes go through FastAPI). Drizzle's schema definition is generated from Alembic with `drizzle-kit pull` so the two sides stay in sync.

## 6. Request flow: sending a chat message

The full life of a single `POST /chat` call.

### Foreground (blocks the user's UI, must be fast)

1. **Client** sends `POST /chat` with `{ conversation_id, content }`. JWT in `Authorization` header.
2. **Auth middleware** verifies the JWT against Supabase JWKs, extracts `user_id`, rejects on failure.
3. **Rate-limit check**: query `usage_daily` for today's row; if `text_msg_count >= 50`, return `429` with a body `{ error: "daily_cap_reached" }`. Otherwise increment and continue.
4. **Persist the user message** to `messages` immediately (without `risk_level` yet) — we want the user's words saved even if the rest fails.
5. **Safety classifier (Haiku 4.5)**:
   - Input: latest message + last 3 turns of context.
   - Output: `{ "risk": "none" | "elevated" | "acute", "reason": string }` as strict JSON.
   - Timeout: 2 s. On timeout or JSON-parse failure, treat as `elevated` and log the failure.
   - Update the user message row with the resulting `risk_level`.
6. **If `acute`:** skip the Companion entirely. Stream the hard-coded crisis card to the client (so the UX feels consistent with normal streaming). Persist it as an `assistant` message with `role='system_crisis'`. Stop.
7. **Otherwise: load context for the Companion**:
   - User's `user_profiles.profile` (jsonb).
   - User's `user_profiles.summary` (rolling text).
   - Last N messages from this conversation, where N is the largest count that fits within a 8k-token budget. If older messages are dropped, the rolling summary covers them.
8. **Call Companion (Sonnet 4.6)** with:
   - System prompt = base persona + assembled profile snapshot + (if `elevated`) elevated-mode addendum.
   - Messages = ordered history.
   - Stream the response back to the client via SSE.
9. **Persist the assistant reply** when streaming completes. Increment `tokens_in/out` in `usage_daily`.
10. **Enqueue background work** (next section).

### Background (after response, doesn't block UI)

11. **Profile updater trigger check**: count assistant replies in this conversation whose `id > last_processed_msg_id` (or all replies if the watermark is null). If the count is ≥ 5, enqueue a `BackgroundTasks` job. The watermark is advanced only when the updater commits successfully (step 12) so failures retry naturally.
12. **Profile updater (Haiku 4.5)**:
    - Input: current `profile` + `summary` + unprocessed messages.
    - Output: updated `profile` (validated against pydantic schema) + updated `summary` (≤ 500 tokens).
    - On schema validation failure, log and bail — don't half-update.
13. **Idle trigger**: a scheduled job (separate from FastAPI; can be a cron in slice 1, replace with proper queue later) runs hourly and picks up conversations with no message in the last 30 min and unprocessed activity.
14. **Auto-title for new conversations**: if this was the first user message in the conversation, kick off a Haiku call to generate a 4–6 word title and write to `conversations.title`. Non-blocking.

## 7. Safety pipeline detail

### Classifier prompt (Haiku 4.5)

```
You are a clinical safety classifier. Given the user's latest message and the
prior 3 turns of context, classify the risk level.

Definitions:
- "acute": The user expresses intent, a plan, or active means for self-harm,
  suicide, or harm to others. Includes recent attempts. Includes disclosures of
  ongoing severe abuse where immediate safety is at risk.
- "elevated": Passive ideation ("I wish I wasn't here"), expressions of
  hopelessness, references to self-harm thoughts without active intent,
  disclosure of past trauma being processed, severe emotional dysregulation.
- "none": Everything else, including stress, anxiety, sadness, anger,
  relationship issues, work issues, and ordinary venting.

Bias toward "elevated" if uncertain between "elevated" and "none". Bias toward
"acute" if uncertain between "acute" and "elevated".

Respond with strict JSON only: {"risk": "...", "reason": "..."}.
```

### Crisis card content (hard-coded, no LLM)

```
I hear that things feel really heavy right now, and I want to stop and be with
you for a moment.

What you're feeling is real, and you don't have to face it alone. Please reach
out to a person who can be with you right now — a trusted friend, family
member, or one of these numbers in India:

📞 iCall (free, confidential): 9152987821
📞 Vandrevala Foundation (24/7): 1860-2662-345
📞 AASRA (suicide prevention): 9820466726
📞 Emergency psychiatric care: 14416
📞 National support line: 1800-599-0019

While you wait or decide, try this with me — 5-4-3-2-1:
  • Name 5 things you can see right now.
  • 4 things you can touch.
  • 3 things you can hear.
  • 2 things you can smell.
  • 1 thing you can taste.

I'll be here when you're ready to keep talking. You matter.
```

> Note: the original repo lists 1800-599-0019 and 14416. I'm including additional verified Indian mental health helplines because variety helps — different lines have different waits and styles. **Aditya should review the helpline list before launch and verify the numbers are still current.**

### Elevated-mode addendum to Companion system prompt

```
The user's current message has been classified as ELEVATED risk. Adjust your
response:

1. Lead with validation. Do not problem-solve in this turn.
2. Reflect what you hear without minimizing or reframing it positively.
3. Gently mention that professional support exists, without pushing.
4. Ask one open question that invites them to stay with the feeling.
5. Do not generate action plans, coping checklists, or "you should..." advice.
```

## 8. Profile-update pipeline detail

### Trigger conditions

- After the 5th, 10th, 15th... assistant reply in a conversation.
- On the hourly idle sweep, for any conversation with no message in 30+ min and unprocessed activity since `last_processed_msg_id`.

### Updater prompt (Haiku 4.5)

```
You maintain a user's living mental-wellbeing profile. You will receive:
- The current profile JSON.
- The current natural-language summary.
- A batch of recent messages between the user and their Companion.

Your job is to produce an updated profile JSON and updated summary that
reflect any new, stable insights from the new messages.

Rules:
- Do not invent facts. Only encode what the user has actually said or what is
  strongly implied by their words.
- Promote a transient mention into the profile only if it appears across
  multiple turns or the user states it as a pattern.
- Remove items from arrays only if the user has clearly contradicted them.
- The summary is for the Companion to read on every turn — keep it under 500
  tokens, third-person, factual, no advice.
- Respond with strict JSON: {"profile": {...}, "summary": "..."}.
```

The output is validated against the pydantic model for `profile`. Validation failure → log and skip the update (the next trigger picks it up).

## 9. Auth model

- **Supabase Auth** handles signup (email + 6-digit magic link), session management, and password resets. No password handling in our code.
- The Next.js client uses `@supabase/ssr` to manage the session in cookies. On every API call, the client sends `Authorization: Bearer <access_token>`.
- **FastAPI middleware** verifies the JWT signature against Supabase's published JWKs (cached, refreshed hourly). On success, the user's UUID is injected into the request via dependency injection.
- Every DB query is filtered by `user_id` at the application layer. We do **not** rely on Postgres RLS in slice 1 — application-layer enforcement is sufficient given a single backend service. RLS may be added later if a future slice introduces cross-service DB access. The application-layer filter is enforced by passing the current `user_id` into every repository function and rejecting requests where the resource's `user_id` doesn't match.

### Why not just use NextAuth?

- We need server-side auth in FastAPI (Python), not just Next.js. Supabase exposes a stable JWT/JWKs endpoint that any backend can verify. NextAuth is Next.js-bound.
- Supabase also gives us managed Postgres on the same dashboard, reducing infra surface area.

## 10. Rate limiting

| Limit | Enforcement | UI feedback |
|---|---|---|
| 50 text messages / user / day (UTC) | Checked + incremented in `usage_daily` before invoking Companion | Counter visible in the chat footer ("12 / 50 messages today"). At 45+ a soft warning appears. At 50, the composer disables and shows "You've reached today's limit — see you tomorrow." |
| Anthropic API failures | Surfaced as 503 with a banner; never silently dropped | "Something's off on our end. Try again in a moment." |
| Per-IP signup throttling | Handled by Supabase Auth | Native Supabase error messages |

Global circuit breaker: a daily Anthropic spend ceiling configurable via env var. If breached, all `/chat` calls return 503 with a "service temporarily unavailable" banner until next UTC midnight. We log + alert.

## 11. API surface

All endpoints are under `/api/v1`. All except `/health` require a valid Supabase JWT.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness probe. Returns `{ok: true}`. |
| GET | `/me` | Returns the current user's basic info + today's usage counter. |
| GET | `/conversations` | List the current user's conversations, ordered by `last_msg_at DESC`. |
| POST | `/conversations` | Create a new conversation. Returns `{id}`. |
| PATCH | `/conversations/{id}` | Rename a conversation (`{title}`). |
| DELETE | `/conversations/{id}` | **Not implemented in slice 1.** The route is not registered. Schema reserves `archived_at` for a later slice. |
| GET | `/conversations/{id}/messages` | Paginated message history (cursor-based). |
| POST | `/chat` | Send a user message. **SSE response.** Body: `{conversation_id, content}`. Streams the assistant reply token-by-token. Special framing for crisis card. |

### SSE framing for `/chat`

```
event: started
data: {"message_id": "<assistant-message-id>", "risk": "none"}

event: token
data: {"text": "That sounds "}

event: token
data: {"text": "really tiring "}

...

event: done
data: {"total_tokens": 287}
```

For acute risk:
```
event: started
data: {"message_id": "...", "risk": "acute", "kind": "crisis_card"}

event: token
data: {"text": "<full crisis card text>"}

event: done
data: {"total_tokens": 0}
```

The client renders crisis_card kind with distinct styling.

## 12. Frontend structure (Next.js 15)

```
apps/web/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx        # email + magic link
│   ├── (app)/
│   │   ├── layout.tsx            # auth gate; mobile drawer shell
│   │   ├── page.tsx              # redirect → /chat
│   │   └── chat/
│   │       ├── page.tsx          # most-recent conversation
│   │       └── [id]/page.tsx     # specific conversation
│   ├── api/health/route.ts       # passthrough to backend
│   ├── manifest.ts               # PWA manifest
│   ├── icon.tsx / apple-icon.tsx # icons
│   └── globals.css
├── components/
│   ├── chat/
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx     # variants: user, assistant, crisis
│   │   ├── Composer.tsx          # text + mic (dictation, not call) + send
│   │   ├── CrisisCard.tsx
│   │   └── QuotaFooter.tsx
│   ├── threads/
│   │   ├── ThreadsDrawer.tsx     # mobile: slide-in; desktop: persistent sidebar
│   │   ├── ThreadList.tsx
│   │   └── NewConversationButton.tsx
│   └── ui/                       # shadcn/ui primitives, themed
├── lib/
│   ├── supabase/                 # server + client clients
│   ├── api.ts                    # typed fetchers + SSE consumer
│   └── theme.ts                  # palette tokens
├── public/
│   └── icons/                    # PWA icons (192, 512, maskable)
├── service-worker.ts             # Workbox-generated; offline shell only
└── tailwind.config.ts
```

### Mobile-first layout rules

- **Default (mobile, <768px):** single column. Header has hamburger (drawer trigger) + title + phone-icon (placeholder for slice 2, disabled with tooltip "Voice coming soon"). Composer is sticky at bottom above the safe-area inset. Threads drawer is a slide-in panel (78% width, dimmed overlay).
- **≥768px (tablet/desktop):** threads drawer becomes a permanent left sidebar (260px). Hamburger button hidden.
- **≥1024px:** chat column gets a max-width of 760px and is centered. Right-pane reserved (empty in slice 1; will hold insights in slice 4).
- **Safe-area handling:** `padding-bottom: env(safe-area-inset-bottom)` on the composer; `padding-top: env(safe-area-inset-top)` on the header.
- **Keyboard handling:** on iOS Safari, use `100dvh` not `100vh` for the chat container so the keyboard doesn't push content off-screen.

### PWA

- `manifest.ts` declares display=standalone, theme color #4A5D4F, background #FAF7F2, icons 192/512/maskable.
- Service worker caches the app shell + static assets only. **No offline messages** — the user sees a "no connection" toast and the composer is disabled.
- Installable on iOS via Share → Add to Home Screen, and on Android via the browser install prompt.

## 13. Backend structure (FastAPI)

```
apps/api/
├── app/
│   ├── main.py                   # FastAPI app + middleware
│   ├── settings.py               # pydantic-settings; loads from env
│   ├── auth.py                   # JWT verification middleware + dependency
│   ├── routers/
│   │   ├── chat.py
│   │   ├── conversations.py
│   │   ├── me.py
│   │   └── health.py
│   ├── agents/
│   │   ├── companion.py          # async generator: yields tokens
│   │   ├── safety.py             # returns SafetyResult pydantic model
│   │   ├── profile_updater.py    # background job entry point
│   │   └── prompts/              # .md files loaded at import
│   │       ├── companion_base.md
│   │       ├── companion_elevated.md
│   │       ├── safety_classifier.md
│   │       └── profile_updater.md
│   ├── crisis/
│   │   ├── card.py               # hard-coded crisis card text + helplines
│   │   └── helplines.py          # structured list with metadata
│   ├── db/
│   │   ├── models.py             # SQLAlchemy models for the 5 tables
│   │   ├── session.py            # async engine + session factory
│   │   └── repos/                # one repo per table; all queries filter by user_id
│   ├── services/
│   │   ├── chat_service.py       # orchestrates the full flow in §6
│   │   ├── rate_limit.py
│   │   └── usage.py
│   └── schemas/                  # pydantic request/response models
├── alembic/
│   ├── env.py
│   └── versions/
├── tests/
│   ├── conftest.py
│   ├── test_safety.py
│   ├── test_companion_streaming.py
│   ├── test_chat_flow.py         # integration with mocked Anthropic
│   ├── test_profile_updater.py
│   ├── test_rate_limit.py
│   └── fixtures/
│       └── canned_anthropic.py   # mocked responses for each scenario
├── pyproject.toml
└── Dockerfile
```

### Async story

Everything is `async`. SQLAlchemy uses the async engine. Anthropic SDK calls are awaited. FastAPI `BackgroundTasks` handles the profile updater (one task per trigger). The hourly idle sweep is a separate process (a cron container in slice 1; replace with proper queue later if needed).

### Source-agnostic Companion (provision for slice 2)

`agents/companion.py` exposes:

```python
async def companion_reply(
    *,
    user_id: UUID,
    conversation_id: UUID,
    user_message: str,
    risk: Literal["none", "elevated"],   # acute is short-circuited upstream
    source: Literal["text", "voice"],    # always "text" in slice 1
) -> AsyncIterator[str]:
    ...
```

Slice 2's voice integration calls this exact function from the LiveKit agent runtime with `source="voice"`. The function does not know or care how its output is being rendered — slice 1's `/chat` endpoint pipes the tokens into SSE; slice 2's voice agent pipes them into a TTS stream.

## 14. UX details for Slice 1

Three primary screens. See the mobile mockup at `.superpowers/brainstorm/.../mobile-chat-mockup.html` and desktop at `.superpowers/brainstorm/.../chat-ui-mockup.html`.

### Login

- One input (email), one button ("Send magic link").
- On submit, show "Check your email" state with a "wrong email?" link.
- Successful link click → /chat.

### Chat (the main screen)

- Header: hamburger (mobile only) + thread title (centered) + phone icon (disabled, tooltip "Voice coming soon").
- Message list: alternating user (sage-green bubbles, right-aligned) and Companion (white bubbles, left-aligned). Streaming reply appears one token at a time with a soft typing cursor.
- Composer: text field + mic icon (browser dictation, no call) + send button. Sticky to bottom.
- Quota footer: "12 / 50 messages today" — turns warning color at 45+, error color at 50.
- Crisis card: replaces a regular assistant bubble. Has its own card styling (warm yellow border, helpline numbers as tap-to-call links).

### Threads (drawer on mobile, sidebar on desktop)

- "+ New conversation" button at top.
- Sections grouped by recency: "Today", "Earlier this week", "Earlier".
- Each row shows the auto-generated title. Tap to switch threads. Long-press (mobile) or hover-and-click 3-dot menu (desktop) opens rename.
- Active thread highlighted.

### Empty / error states

- New user: chat shows a one-time onboarding bubble from the Companion ("I'm here to be a steady presence. There's no script — share whatever's on your mind.").
- Rate-limited: composer disabled, banner "You've reached today's limit — see you tomorrow."
- Network down: toast "No connection — your message hasn't been sent."
- Backend down: banner "Service is temporarily unavailable. Working on it."

## 15. Voice provisions (preparing for slice 2)

To make slice 2 a clean addition rather than a rewrite:

- `messages.source` field already in the schema, default `'text'`.
- `companion_reply()` accepts a `source` parameter so the prompts can subtly adjust for voice (shorter sentences, no markdown formatting).
- The header phone icon UI lives in slice 1 (disabled) so slice 2 only needs to wire up the action.
- Crisis-card delivery is decoupled from the assistant pathway — slice 2's voice will use the same `safety` classifier and, on `acute`, the voice agent reads the crisis card via TTS.
- `usage_daily.voice_seconds` column already exists for slice 2's rate limiting.

That is the entire set of provisions. We do not build any voice code in slice 1.

## 16. Error handling

| Failure | Behavior |
|---|---|
| Anthropic timeout (Companion) | Stream a graceful message: "I'm having trouble responding right now — try again in a moment." Persist neither the partial reply nor a failed marker — the user can simply resend. |
| Anthropic timeout (classifier) | Treat as `elevated`. Log structured event `safety_classifier_failed`. |
| Anthropic JSON parse fail (classifier) | Treat as `elevated`. Log + sample to alerts (this would be a prompt-drift signal). |
| Anthropic API quota exhausted (global) | 503 with banner "Service temporarily unavailable." Log + alert. |
| DB write fails (user message) | Return 500. The reply hasn't been generated yet so no orphan. |
| DB write fails (assistant message after stream complete) | Reply is on the user's screen already; show toast "couldn't save this message." Log. The next user message rebuilds context from what we have. |
| JWT invalid / expired | 401. Frontend redirects to login. |
| Rate-limit hit | 429 with `{error: "daily_cap_reached"}`. Frontend disables composer and shows the cap banner. |
| Profile updater failure | Silent retry on next trigger (the watermark `last_processed_msg_id` is not advanced until the update commits). User never sees this. |
| Network disconnect mid-stream | Frontend reconnects to `/chat` resume endpoint if implemented; otherwise the user resends. **Slice 1: no resume.** The partial reply is lost on disconnect. |

## 17. Observability

- **Structured logs** (JSON, one event per line) via `structlog`. Required fields on every chat-flow log: `request_id`, `user_id`, `conversation_id`, `message_id` (when relevant), `event`, `latency_ms`, `cost_estimate_cents` (when an LLM call was made).
- **Key events to log**: `chat_request_started`, `safety_classifier_decision`, `crisis_card_served`, `companion_response_complete`, `profile_updater_run`, `rate_limit_hit`, `anthropic_call_failed`.
- **Metrics surfaced in `/me`** (for visibility, not billing): today's text msg count. Aggregate counters live in `usage_daily`.
- **No 3rd-party analytics in slice 1.** No Mixpanel, no Posthog. Plain logs to stdout, viewable via the hosting platform.

## 18. Testing strategy

| Layer | What it tests | How |
|---|---|---|
| Unit | safety result parsing; profile JSON validation; prompt assembly (profile + summary injection); JWT verification; rate-limit math | `pytest`, no network |
| Integration | full `/chat` flow with a mocked Anthropic client; happy path, acute path, elevated path, classifier-timeout path, rate-limit path, DB-write-fail path | `pytest` with a stub Anthropic client returning canned responses; real Postgres via testcontainers |
| Manual | 10 hand-curated user messages spanning none/elevated/acute, run weekly against the live classifier to track drift | a one-off script `scripts/classifier_eval.py` |
| Frontend | component rendering (user bubble, assistant bubble, crisis card, composer disabled state); SSE consumer logic | `vitest` + `@testing-library/react` |
| E2E | sign up → send a message → receive streamed reply → see counter update; on a phone-sized viewport | Playwright, one happy-path test |

Coverage target: not a number, but every branch in `chat_service.py` and `safety.py` must be exercised by at least one integration test. The classifier prompt's behavior is verified by the manual eval, not by unit tests.

## 19. Open questions and risks

- **Helpline accuracy.** The numbers in §7 need verification before launch — helplines change. This is Aditya's call.
- **Tone validation.** The Companion's voice is the product. We need ~20 prompt iterations with real conversations before slice 1 ships. This will not be a single "write the prompt and move on" exercise.
- **Cost ceiling.** The global daily Anthropic spend ceiling needs a number. Defaulting to $20/day until usage data exists.
- **Mobile keyboard quirks.** iOS Safari + 100dvh + sticky composer is historically fiddly; expect to spend a half-day getting it right on real devices.
- **PWA install on iOS.** Add-to-Home-Screen UX is platform-controlled; we can't programmatically prompt. A one-time toast hint on first visit from iOS Safari is the most we can do.
- **Auto-title quality.** Haiku-generated titles can be flat ("Conversation about feelings"). Worth iterating; users can always rename.
- **Profile drift.** The profile updater can encode wrong inferences. Slice 1 surfaces the profile only to the Companion, not the user. Slice 2+ might add a "what I know about you" view so the user can correct it.

## 20. What this slice does NOT include

Restated explicitly so nobody (including me, six weeks from now) misremembers:

- ❌ Voice calls.
- ❌ Visible specialist agents.
- ❌ Mood / sleep / stress logging UI.
- ❌ Journal entries.
- ❌ Weekly recap.
- ❌ Saved action plans.
- ❌ Notifications.
- ❌ Multi-language.
- ❌ Native mobile apps.
- ❌ Analytics dashboards.
- ❌ Therapist-share PDF export.
- ❌ Free-tier vs paid plans (everyone is on the same 50-msg/day cap in slice 1).

---

**Next step after this spec is approved:** invoke the `superpowers:writing-plans` skill to turn this design into a numbered implementation plan with concrete tasks and ordering.
