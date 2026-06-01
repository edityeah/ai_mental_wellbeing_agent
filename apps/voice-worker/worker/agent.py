"""The Companion's voice incarnation.

Architecture: livekit-agents pipeline = STT → LLM → TTS. We use Deepgram for
STT, Cartesia for TTS, and a custom `CompanionLLM` (companion_llm.py) that
wraps `app.agents.companion.stream_reply` + `app.agents.safety.classify`.
The custom LLM is required because livekit-agents skips response generation
entirely when `llm=None`."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
)
from livekit.plugins import cartesia, deepgram, silero

from worker.api_client import VoiceApiClient, heartbeat_loop
from worker.companion_llm import CompanionLLM
from worker.settings import get_settings

logger = logging.getLogger(__name__)

# protobuf enum: 0 = PARTICIPANT_KIND_STANDARD (the human user, not other agents)
_PARTICIPANT_KIND_STANDARD = 0


class CompanionAgent(Agent):
    """Voice-side Companion. All actual response generation happens in the
    CompanionLLM passed to AgentSession — this class is mostly a placeholder.
    The greeting is triggered from `on_enter`, which fires AFTER the activity
    is fully started (so speech scheduling is unpaused)."""

    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are the Companion — a warm, unhurried voice presence. "
                "Keep replies short (1-2 sentences). Use spoken contractions. "
                "Lead with validation, not advice."
            ),
        )

    async def on_enter(self) -> None:
        # Use generate_reply (the framework-blessed greeting path) instead
        # of bare session.say(). generate_reply runs through the LLM +
        # scheduler properly — bare say() left scheduling paused and
        # caused every follow-up user turn to be dropped.
        try:
            await self.session.generate_reply(
                instructions=(
                    "Greet the user warmly in one short sentence — just "
                    "let them know you're here whenever they're ready. "
                    "Do not ask a question yet."
                ),
                allow_interruptions=True,
            )
        except Exception as e:
            logger.warning("greeting_failed: %s", e)


def _parse_participant_metadata(
    p: rtc.RemoteParticipant,
) -> tuple[uuid.UUID, uuid.UUID, int]:
    """Returns (user_id, conversation_id, voice_seconds_remaining).
    Raises if metadata is malformed."""
    md = json.loads(p.metadata or "{}")
    user_id = uuid.UUID(p.identity)
    conversation_id = uuid.UUID(md["conversation_id"])
    voice_seconds_remaining = int(md.get("voice_seconds_remaining", 0))
    return user_id, conversation_id, voice_seconds_remaining


async def entrypoint(ctx: JobContext) -> None:
    """LiveKit job entry. Called once per room our worker handles."""
    s = get_settings()
    await ctx.connect()
    room_name = ctx.room.name
    logger.info("voice_job_started room=%s", room_name)

    # Wait for the user (a STANDARD participant) to join.
    user_participant: rtc.RemoteParticipant | None = None
    deadline = time.monotonic() + 15.0
    while time.monotonic() < deadline:
        for p in ctx.room.remote_participants.values():
            if int(p.kind) == _PARTICIPANT_KIND_STANDARD:
                user_participant = p
                break
        if user_participant is not None:
            break
        await asyncio.sleep(0.2)

    if user_participant is None:
        logger.warning("voice_job_no_participant room=%s", room_name)
        return

    try:
        user_id, conversation_id, _remaining = _parse_participant_metadata(
            user_participant
        )
    except Exception as e:
        logger.error("voice_job_bad_metadata room=%s err=%s", room_name, e)
        return

    logger.info(
        "voice_job_participant user_id=%s conv=%s",
        user_id,
        conversation_id,
    )

    api_client = VoiceApiClient(room_name)
    start_ts = time.monotonic()

    session = AgentSession(
        stt=deepgram.STT(model="nova-2", api_key=s.deepgram_api_key),
        tts=cartesia.TTS(
            model="sonic-2",
            voice=s.cartesia_voice_id,
            api_key=s.cartesia_api_key,
        ),
        vad=silero.VAD.load(),
        llm=CompanionLLM(user_id=user_id, conversation_id=conversation_id),
    )

    end_reason: str = "user_hangup"

    # Wait on this until the user disconnects from the room. Without it,
    # the entrypoint would return after session.start() and the framework
    # would tear the session down before the user could even speak.
    disconnected = asyncio.Event()

    async def trigger_end(reason: str) -> None:
        nonlocal end_reason
        end_reason = reason
        try:
            session.shutdown(drain=True)
        except Exception as e:
            logger.warning("session_shutdown_failed: %s", e)
        # Wake up the entrypoint's wait so we can run the finally block.
        try:
            disconnected.set()
        except Exception:
            pass

    agent = CompanionAgent()

    heartbeat_task = asyncio.create_task(
        heartbeat_loop(
            api_client,
            get_elapsed_seconds=lambda: int(time.monotonic() - start_ts),
            on_should_end=trigger_end,
            interval_seconds=s.heartbeat_interval_seconds,
        )
    )

    def _on_user_disconnect(p: rtc.RemoteParticipant) -> None:
        # Only end on OUR user disconnecting, not other agents.
        try:
            if p.identity == str(user_id):
                disconnected.set()
        except Exception:
            pass

    ctx.room.on("participant_disconnected", _on_user_disconnect)

    try:
        await session.start(
            room=ctx.room,
            agent=agent,
            # Bind to THIS user's audio. Without participant_identity,
            # the agent attaches to participant=null — STT receives no
            # audio and every user turn is silently dropped.
            room_input_options=RoomInputOptions(
                participant_identity=str(user_id),
            ),
        )
        # Hold here until the user disconnects (or the worker is shut down
        # externally via trigger_end). Without this hold, the framework
        # would tear the session down right after the greeting plays —
        # before the user has a chance to say anything.
        await disconnected.wait()
    except Exception as e:
        logger.exception("voice_job_failed room=%s err=%s", room_name, e)
        end_reason = "error"
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        try:
            await session.aclose()
        except Exception:
            pass
        duration = int(time.monotonic() - start_ts)
        await api_client.end(
            duration_seconds=duration,
            end_reason=end_reason,
        )
        await api_client.aclose()
        logger.info(
            "voice_job_ended room=%s duration=%ds reason=%s",
            room_name,
            duration,
            end_reason,
        )
