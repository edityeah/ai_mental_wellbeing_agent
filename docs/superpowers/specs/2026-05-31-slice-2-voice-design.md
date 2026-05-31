# Slice 2 — Voice Calling Agent: Design Document

**Status:** Draft for review
**Author:** Aditya Chaudhari, with Claude
**Date:** 2026-05-31
**Project:** Mental Wellbeing Companion. Slice 1 (text chat) shipped. This slice adds real-time WebRTC voice calls to the same Companion, reusing all the Slice 1 brain.

---

## 1. Where this fits

Slice 2 of 5. Voice is the differentiator that turns the app from "another chatbot" into something that feels human at 11 pm.

| Slice | Status |
|---|---|
| 1. Foundation + Chat | ✅ shipped — see [`2026-05-28-slice-1-foundation-chat-design.md`](./2026-05-28-slice-1-foundation-chat-design.md) |
| **2. Voice calling agent** | **this doc** |
| 3. Specialist team | planned — voice picks this up for free |
| 4. Mood + Journal | planned |
| 5. Weekly recap | planned |

**After Slice 2 ships:** a user can open the chat, tap the phone icon in the header, and have a real-time voice conversation with the Companion. The transcript flows into the same conversation thread. Same crisis safety, same memory.

## 2. Locked decisions (from brainstorming)

- **Voice transport:** LiveKit Cloud (free tier; managed media server). No self-hosted LiveKit.
- **STT:** Deepgram (`nova-2` English model). ~200ms transcript latency.
- **TTS:** Cartesia (`sonic-2` model). ~75ms first-chunk latency, much faster than ElevenLabs.
- **Voice persona:** Warm female Indian-English. Cartesia has solid options in this category; specific voice id pinned at implementation time after a quick audition.
- **Audio retention:** 24h, then auto-delete. Recordings live in Supabase Storage (same project we already use). A daily cron deletes >24h objects.
- **Daily voice cap:** 10 minutes per user per UTC day. Hard cap.
- **Per-call limits:** 5 minutes max wall-clock; 30 seconds of silence auto-ends.
- **Barge-in:** Full barge-in. User interrupting mid-utterance stops the agent and pivots to listening. LiveKit's VAD + agent framework handles this natively.
- **Brain:** Same `companion.stream_reply` + `safety.classify` + profile flow as Slice 1. The voice worker imports them; no duplication.
- **Crisis flow:** Identical to Slice 1 — every user turn (post-STT transcript) runs through Haiku safety classifier. `acute` → TTS reads the crisis card and ends the call. `elevated` → companion uses elevated-mode prompt. `none` → normal.
- **Phone numbers / PSTN:** Out of scope for v1. In-app WebRTC voice only.
- **Worker host:** Same docker-compose service in dev; separate supervised process in prod (alongside FastAPI).

## 3. Scope

### In scope

- LiveKit Cloud project setup (Aditya does this manually, like Supabase).
- Python voice agent worker process using `livekit-agents`.
- Deepgram + Cartesia + Anthropic plugin wiring.
- New FastAPI endpoints: `/voice/token`, `/voice/sessions/{room}/heartbeat`, `/voice/sessions/{room}/end`.
- New `voice_sessions` table + Alembic migration.
- Frontend call screen (Next.js, `livekit-client`).
- Voice transcripts persisted as messages with `source="voice"` in the same conversation thread.
- Cost controls: daily 10-min cap, per-call limit, idle timeout, mid-call quota enforcement via heartbeat.
- Audio egress to Supabase Storage with 24h retention via daily cron.
- Tests: unit tests for the agent's safety + companion wiring (mocked Anthropic + mocked LiveKit RoomCtx). One Playwright smoke that opens the call screen (does not place a real call).

### Out of scope (deferred)

- ❌ PSTN / real phone numbers.
- ❌ Video.
- ❌ Multi-language voice (English only in v2).
- ❌ Custom voice cloning.
- ❌ Saved action plans / specialists (Slice 3).
- ❌ User-controlled voice settings UI (one voice for everyone in v2).
- ❌ Group calls / multi-user.

## 4. Locked stack additions

```
apps/
└── api/                      # existing
    └── pyproject.toml        # adds: livekit-agents, livekit-plugins-deepgram,
                              #       livekit-plugins-cartesia, livekit-plugins-anthropic,
                              #       livekit-api (token signing)
└── voice-worker/             # NEW — separate Python project
    ├── pyproject.toml        # depends on apps/api (as path dep) for shared imports
    ├── worker.py             # entry point — livekit Agent class
    └── README.md
└── web/                      # existing
    └── package.json          # adds: livekit-client
```

`apps/voice-worker` imports `app.agents.companion`, `app.agents.safety`, `app.db.session`, `app.db.repos` etc. from `apps/api`. We add `apps/api` as a path-dep in the worker's `pyproject.toml`:

```toml
[tool.uv.sources]
mwc-api = { path = "../api", editable = true }
```

This keeps the voice worker a standalone process (its own venv, its own deps, its own command) but lets it `from app.agents import safety` etc. so we don't duplicate logic.

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser / Phone (Next.js PWA, livekit-client SDK)                   │
│                                                                      │
│  1. User taps phone icon in chat header                              │
│  2. POST /api/v1/voice/token   → access_token, room, livekit_url     │
│     (FastAPI checks: signed in, voice_seconds < 600 today)           │
│  3. livekit-client connects to LiveKit Cloud room                    │
│  4. Publishes mic, subscribes to agent audio                         │
└──────────────────┬───────────────────────────────────────────────────┘
                   │ WebRTC
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LiveKit Cloud (managed media server)                                │
│  - Routes RTP between browser ↔ agent worker                         │
│  - Egress: encodes the call audio, ships to Supabase Storage         │
└──────────────────┬───────────────────────────────────────────────────┘
                   │ WebRTC
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Voice agent worker (apps/voice-worker, Python)                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │  livekit-agents pipeline                                 │        │
│  │                                                          │        │
│  │  mic audio ─► Deepgram STT ─► user transcript            │        │
│  │  user transcript ─► safety.classify (Haiku)              │        │
│  │     ├─ "acute"    → read crisis card via TTS, end call   │        │
│  │     ├─ "elevated" → companion.stream_reply(risk="…")     │        │
│  │     └─ "none"     → companion.stream_reply(risk="none")  │        │
│  │  companion tokens ─► Cartesia TTS ─► agent audio         │        │
│  │  every turn: persist user + assistant messages           │        │
│  │              (source="voice") to Postgres                │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  - Heartbeats POST /voice/sessions/{room}/heartbeat every 10s        │
│    so FastAPI can enforce the daily cap mid-call.                    │
│  - On end: POST /voice/sessions/{room}/end with reason + duration.   │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼ (audio egress, async)
┌──────────────────────────────────────────────────────────────────────┐
│  Supabase Storage bucket `voice-recordings/`                         │
│  - Daily cleanup cron deletes files where created_at < now() - 24h.  │
└──────────────────────────────────────────────────────────────────────┘
```

## 6. Data model changes

One new table. No changes to existing Slice 1 tables.

### `voice_sessions`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk → users.id | |
| `conversation_id` | uuid fk → conversations.id | call writes its messages here |
| `room_name` | text unique | LiveKit room id |
| `started_at` | timestamptz | server_default `now()` |
| `ended_at` | timestamptz nullable | written by `POST /end` |
| `duration_seconds` | int nullable | computed at end |
| `end_reason` | text nullable | enum below |
| `audio_egress_url` | text nullable | Supabase Storage path; nulled when audio deleted |

**`end_reason` enum:** `user_hangup` / `silence_timeout` / `max_duration` / `quota_exhausted` / `agent_crisis_redirect` / `error`.

Indexes: `(user_id, started_at DESC)` for "your past calls" queries later.

Alembic migration `0002_voice_sessions.py`.

## 7. New FastAPI endpoints

All under `/api/v1`. JWT-protected via existing `CurrentUser` dependency.

### POST `/voice/token`

Mint a LiveKit access token. Body: `{ conversation_id: uuid }`.

Behaviour:
1. Look up the conversation, confirm it belongs to this user.
2. Check `usage_daily.voice_seconds` for today (UTC). If `>= 600` (10 min × 60), return `429 { error: "daily_voice_cap_reached", reset_at: "<UTC midnight>" }`.
3. Generate a new `voice_sessions` row with a fresh `room_name` (UUID prefixed with `room-`).
4. Sign a LiveKit access token using `livekit-api` SDK with:
   - `identity = user_id`
   - `name = display_name or email`
   - `room = room_name`
   - `metadata = { conversation_id, voice_seconds_remaining }`
   - `permissions = { canPublish: true, canSubscribe: true, room: room_name }`
   - `ttl = 600` (10 min — the absolute hard upper bound; the *per-call* 5-min limit is enforced inside the worker via the heartbeat. TTL just needs to be ≥ daily cap so a user can use their full quota in one session if they want.)
5. Return:
   ```json
   {
     "access_token": "...",
     "room_name": "room-xxx",
     "livekit_url": "wss://YOUR-PROJECT.livekit.cloud",
     "ttl_seconds": 600,
     "voice_seconds_remaining": 540
   }
   ```

### POST `/voice/sessions/{room_name}/heartbeat`

Called by the agent worker every 10 seconds during a call. Body: `{ elapsed_seconds: int }`.

Behaviour:
1. Look up `voice_sessions` by `room_name`.
2. Atomically: read today's `usage_daily.voice_seconds`. If `voice_seconds + elapsed_seconds_since_last_heartbeat >= 600`, set `should_end = true, reason = "quota_exhausted"`.
3. If session duration >= 300s (5 min), `should_end = true, reason = "max_duration"`.
4. Otherwise increment `usage_daily.voice_seconds` by the delta and return `{should_end: false}`.

Server-issued only — frontend never calls this.

### POST `/voice/sessions/{room_name}/end`

Called by the agent worker when the call ends. Body: `{ duration_seconds: int, end_reason: str, audio_egress_url: str | null }`.

Behaviour:
1. Update `voice_sessions`: set `ended_at`, `duration_seconds`, `end_reason`, `audio_egress_url`.
2. Final delta added to `usage_daily.voice_seconds`.
3. Returns 200.

### Frontend client additions

`apps/web/lib/api/voice.ts`:
- `requestVoiceToken(conversationId)` → calls `/voice/token`, returns the response.

The heartbeat + end endpoints are **server-side only** — only the agent worker calls them, using a shared `VOICE_WORKER_SECRET` env var.

## 8. Voice agent worker

`apps/voice-worker/worker.py` is a single `livekit.agents.Agent` subclass.

```python
class CompanionVoiceAgent(Agent):
    """The voice incarnation of the Companion. Same brain as text chat."""

    def __init__(self):
        super().__init__(
            instructions="(loaded from companion_base.md)",
            stt=deepgram.STT(model="nova-2"),
            tts=cartesia.TTS(voice_id=settings.cartesia_voice_id, model="sonic-2"),
            # llm is NOT a livekit plugin — we own the response generation
            # via our existing companion.stream_reply.
            llm=None,
            vad=silero.VAD.load(),  # for barge-in + silence detection
        )

    async def on_user_turn_complete(self, ctx: AgentContext, message: ChatMessage) -> None:
        """Called by the framework when STT has a final user transcript."""
        user_text = message.text
        await self._persist_user_message(ctx, user_text)

        # Safety classifier (same as Slice 1)
        history = await self._load_history(ctx)
        result = await safety.classify(user_text, history=history)
        await self._update_user_risk(ctx, result.risk)

        if result.risk == "acute":
            await self._speak(ctx, CRISIS_CARD_TEXT)
            await self._end_call(ctx, reason="agent_crisis_redirect")
            return

        # Companion stream (same as Slice 1)
        async def text_stream():
            async for chunk in companion.stream_reply(
                history=history + [{"role": "user", "content": user_text}],
                risk=result.risk,
                source="voice",  # tells the prompt to keep replies short
                profile=ctx.profile,
                summary=ctx.summary,
            ):
                yield chunk

        await self._speak_stream(ctx, text_stream())
        await self._persist_assistant_message(ctx, "<accumulated text>")
```

Worker entry point:
```python
async def entrypoint(ctx: JobContext):
    user_id, conv_id = parse_metadata(ctx.room.local_participant.metadata)
    await ctx.connect()
    session = AgentSession(ctx, agent=CompanionVoiceAgent(...))
    await session.start()
    # Heartbeat loop runs in parallel
    asyncio.create_task(heartbeat_loop(ctx, session))
    await session.aclose()
```

The worker process is started by `livekit_agents.cli.run_app(entrypoint, ...)` which subscribes to the LiveKit Cloud project. When a new room is created (after `/voice/token`), LiveKit Cloud dispatches a job to the worker; the worker joins as the "Companion" participant and starts the session.

## 9. Crisis flow in voice

The end-to-end path mirrors Slice 1's text crisis flow:

1. User finishes speaking → Deepgram returns final transcript.
2. Worker calls `safety.classify(user_text, history)`.
3. If `acute`:
   - The Companion turn is **not** generated.
   - Worker speaks the `CRISIS_CARD_TEXT` via Cartesia TTS.
   - After TTS completes, worker calls `/voice/sessions/{room}/end` with `reason="agent_crisis_redirect"` and gracefully ends the call.
   - Persists a `role="system_crisis"` message with `source="voice"` so the user sees the helplines in the chat thread after the call ends.
4. If `elevated`:
   - Companion runs with the elevated-mode prompt (same as Slice 1).
5. If `none`:
   - Normal companion response.

## 10. Error handling

| Failure | Behavior |
|---|---|
| LiveKit token signing fails | 500 to frontend; frontend shows "Couldn't start the call. Try again." |
| User mic permission denied | LiveKit client throws on `connect()`; frontend catches and shows a friendly "We couldn't access your microphone…" |
| Network drops mid-call | LiveKit client auto-reconnects (up to 30s). If reconnect fails, frontend shows "Lost connection" + reset to chat view. The agent worker sees the participant disconnect and calls `/end` with `reason="error"`. |
| Deepgram STT errors mid-call | Agent speaks "I'm having trouble hearing you" via TTS, retries. If 3 consecutive failures, ends call with `reason="error"`. |
| Cartesia TTS errors mid-call | Skip the audio chunk, log. If 3 consecutive failures, end. |
| Anthropic errors (safety classifier) | Fall back to `elevated` (same as Slice 1). |
| Anthropic errors (companion) | Agent speaks "I'm having trouble responding — can you say that again?" Skip the turn. |
| Quota hit mid-call (`should_end=true` from heartbeat) | Agent speaks "I want to keep going but we've hit today's limit. Tomorrow." Ends gracefully. |
| Audio egress upload fails | Log; `audio_egress_url` stays null; transcript still persisted. Non-blocking. |

## 11. Cost controls

| Layer | Control |
|---|---|
| **Daily cap** | 10 min/user/day, enforced before token issue + mid-call via heartbeat |
| **Per-call cap** | 5 min wall-clock, enforced via heartbeat |
| **Silence auto-end** | 30s of VAD silence ends the call (in worker) |
| **Token TTL** | 10 min — even if all other guards fail, the LiveKit token expires |
| **Global daily LiveKit minute ceiling** | Env var `DAILY_VOICE_MINUTES_GLOBAL` (default 500). FastAPI rejects new tokens when total today exceeds this. |
| **Anthropic spend ceiling** | Same `DAILY_COST_CEILING_USD` from Slice 1 — applies to safety+companion calls during voice too. |

## 12. Observability

- Structured logs (existing structlog setup) get new event types: `voice_token_issued`, `voice_session_started`, `voice_safety_decision`, `voice_companion_turn`, `voice_session_ended`, `voice_crisis_redirect`, `voice_quota_exhausted`.
- LiveKit Cloud dashboard shows per-call latency, connection quality.
- We track first-byte-audio latency (`token → first audio chunk from agent`) — target < 1.5s.

## 13. Frontend call experience

(Wireframes were drafted during Slice 1 brainstorming; recap here.)

**Entry:** Phone icon in the chat header (currently disabled). Tapping it:
1. Calls `/voice/token`.
2. Opens a full-screen modal: dark sage gradient, pulsing 🍃 orb, "Connecting…".
3. Once LiveKit room is joined: state transitions to "Connected". Caption underneath the orb shows what the agent just said (live transcript). Timer in the top corner. Three controls: mute, end call, speaker.
4. On end: modal closes with a gentle fade. The chat thread now has the new voice messages (with a small phone icon next to each).

**Disabled states:**
- Daily cap exhausted: phone icon greyed; tooltip "Voice limit reached for today."
- No mic permission: phone icon stays; first tap triggers the permission prompt; on deny, shows a one-time helper.

**No new pages.** Voice is a modal overlay on top of the existing chat page.

## 14. Slice 3 provisions

The agent worker calls `companion.stream_reply(...)` directly. When Slice 3 modifies that function to dispatch to specialists, voice automatically benefits. No voice-worker changes needed for Slice 3.

The `source="voice"` field already exists on `messages` from Slice 1's schema. Slice 3 specialists can detect voice context if they need to adjust tone.

## 15. Testing strategy

| Layer | What | How |
|---|---|---|
| Unit | safety classifier path on voice transcripts (same as Slice 1); heartbeat logic; token signing | pytest, mocked LiveKit + Anthropic |
| Integration | full voice turn: STT mock → safety → companion → TTS mock → persistence | pytest with stubbed plugin classes; verify messages land in DB with `source="voice"` |
| Manual | place an actual call locally with mic, send 3 messages, verify transcripts appear in chat | runbook in `apps/voice-worker/README.md` |
| Frontend | render the call screen modal in all three states | vitest |
| E2E smoke | Playwright opens the chat, clicks the phone icon, verifies the call modal renders + connecting state | one happy-path test (no real call placed) |

## 16. Open questions and risks

- **Cartesia voice id selection.** We pin a specific voice id at implementation time. Aditya picks from 3-4 finalists once the wiring runs.
- **LiveKit Cloud SDK auth.** `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` need to be added to `.env` (and to prod secrets). Free tier credentials are fine for early launch.
- **Supabase Storage bucket setup.** We need to create a bucket named `voice-recordings` with private RLS in the Supabase dashboard. One-time.
- **First-token latency budget.** Target < 1.5s. With safety classifier (Haiku ~500-1000ms) + companion first token (Sonnet ~800-1500ms) running sequentially, we're at 1.3-2.5s. May need to parallelize like the Slice 1 attempt (which we reverted due to bugs). Defer optimization until we measure live.
- **Worker autoscale.** Single worker process handles one call at a time? Actually `livekit-agents` supports concurrent jobs via `Worker.num_idle_processes`. Default of 4 should be ample for early scale.
- **Privacy of crisis-flagged content in transcripts.** Acute-flagged transcripts persist as messages (so the user can re-read the crisis card later). The original user audio is deleted at 24h. Net: text persists, audio doesn't. Defensible.

## 17. What this slice does NOT include

- ❌ PSTN / phone-number access to the Companion.
- ❌ Video calls.
- ❌ Custom or user-selectable voice.
- ❌ Multi-language support (English only).
- ❌ Group calls.
- ❌ Saved action plans.
- ❌ Specialist dispatch (Slice 3).
- ❌ Voice analytics dashboard.
- ❌ User-visible past-calls history UI (the `voice_sessions` rows exist but aren't surfaced).

---

**Next step after this spec is approved:** invoke `superpowers:writing-plans` to turn it into a numbered implementation plan with TDD-style tasks.
