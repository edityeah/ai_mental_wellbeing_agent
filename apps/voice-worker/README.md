# mwc-voice-worker

LiveKit Agents worker for the Mental Wellbeing Companion. Joins rooms created via the API's `POST /voice/token`, runs STT → safety → companion → TTS, persists transcripts.

## Dev

```bash
cd apps/voice-worker
uv sync
uv run python -m worker.main dev
```

This connects to LiveKit Cloud using the same creds the API uses (read from `../api/.env`). The worker stays up and waits for new rooms.

## How a call flows

1. User taps phone icon in the web app → `POST /api/v1/voice/token` returns access token + room name.
2. Browser joins the room via WebRTC.
3. LiveKit Cloud sees a new room and dispatches an `entrypoint` job to this worker.
4. Worker joins the room as the Companion, runs the agent loop until the call ends.
5. Worker calls `POST /api/v1/voice/sessions/{room}/end` to record duration + reason.

## Voice tuning

`cartesia_voice_id` in `worker/settings.py` controls the voice. Default is a warm female Indian-English voice — swap to any Cartesia voice id to audition alternatives.
