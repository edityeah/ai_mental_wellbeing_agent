"""The Companion's voice incarnation. Shares brain with text chat via imports
from apps.api."""
from __future__ import annotations
import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
)
from livekit.agents.llm import ChatContext, ChatMessage
from livekit.plugins import cartesia, deepgram, silero

# Imports from apps/api via the path-dep
from app.agents import companion, safety
from app.crisis.card import CRISIS_CARD_TEXT
from app.db import repos
from app.db.session import get_sessionmaker

from worker.api_client import VoiceApiClient, heartbeat_loop
from worker.settings import get_settings

logger = logging.getLogger(__name__)

# protobuf enum: 0 = PARTICIPANT_KIND_STANDARD (the human user, not other agents)
_PARTICIPANT_KIND_STANDARD = 0


@asynccontextmanager
async def db_session():
    """Async-with wrapper around the SQLAlchemy session factory."""
    sm = get_sessionmaker()
    async with sm() as session:
        try:
            yield session
        finally:
            await session.rollback()


async def _load_history(conversation_id: uuid.UUID) -> list[dict]:
    async with db_session() as session:
        msgs = await repos.list_messages(
            session, conversation_id=conversation_id, limit=30
        )
        out: list[dict] = []
        for m in msgs:
            if m.role in ("user", "assistant"):
                out.append({"role": m.role, "content": m.content})
        return out


async def _persist_turn(
    *,
    conversation_id: uuid.UUID,
    role: str,
    content: str,
    risk_level: str | None,
) -> None:
    async with db_session() as session:
        await repos.append_message(
            session,
            conversation_id=conversation_id,
            role=role,
            content=content,
            source="voice",
            risk_level=risk_level,
            token_count=max(1, len(content) // 4),
        )
        await session.commit()


async def _load_profile(user_id: uuid.UUID) -> tuple[dict, str]:
    async with db_session() as session:
        row = await repos.get_or_create_profile(session, user_id=user_id)
        await session.commit()
        return row.profile, row.summary


class CompanionAgent(Agent):
    """The voice Companion. Same prompts as text — just shorter responses for voice."""

    def __init__(self, *, user_id: uuid.UUID, conversation_id: uuid.UUID):
        super().__init__(
            instructions="(prompts assembled per-turn from companion.stream_reply)"
        )
        self._user_id = user_id
        self._conversation_id = conversation_id
        # Set by entrypoint() once the AgentSession is constructed so we can
        # call shutdown() / track end_reason from inside on_user_turn_completed.
        self._on_crisis_redirect = None  # type: ignore[assignment]

    def bind_crisis_callback(self, cb) -> None:
        """entrypoint wires up a callback so the agent can request session shutdown
        with the right end_reason ('agent_crisis_redirect')."""
        self._on_crisis_redirect = cb

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        """Called by livekit-agents when STT has a finalized user transcript."""
        user_text = (new_message.text_content or "").strip()
        if not user_text:
            return

        logger.info(
            "voice_user_turn user_id=%s text=%r", self._user_id, user_text[:80]
        )

        # Load context
        history = await _load_history(self._conversation_id)

        # Safety classifier (same as Slice 1)
        result = await safety.classify(user_text, history=history)  # type: ignore[arg-type]
        await _persist_turn(
            conversation_id=self._conversation_id,
            role="user",
            content=user_text,
            risk_level=result.risk,
        )
        logger.info("voice_safety_decision risk=%s", result.risk)

        if result.risk == "acute":
            # Persist + speak the crisis card, then ask the entrypoint to end the call.
            await _persist_turn(
                conversation_id=self._conversation_id,
                role="system_crisis",
                content=CRISIS_CARD_TEXT,
                risk_level=None,
            )
            session = self.session
            handle = await session.say(CRISIS_CARD_TEXT)
            try:
                await handle.wait_for_playout()
            except Exception:
                pass
            if self._on_crisis_redirect is not None:
                await self._on_crisis_redirect()
            return

        # Stream the companion reply through TTS.
        profile, summary = await _load_profile(self._user_id)
        history_with_user = history + [{"role": "user", "content": user_text}]

        # Collect the full text first so we can persist it. (We could stream
        # directly into session.say() with an AsyncIterable, but persistence
        # needs the final content anyway.)
        collected: list[str] = []
        async for piece in companion.stream_reply(
            history=history_with_user,  # type: ignore[arg-type]
            risk=result.risk,  # type: ignore[arg-type]
            source="voice",
            profile=profile,
            summary=summary,
        ):
            collected.append(piece)
        full_text = "".join(collected).strip()
        if not full_text:
            return

        session = self.session
        await session.say(full_text)

        await _persist_turn(
            conversation_id=self._conversation_id,
            role="assistant",
            content=full_text,
            risk_level=None,
        )


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
        # llm is intentionally unset — we override response generation in
        # CompanionAgent.on_user_turn_completed (we own companion.stream_reply).
    )

    end_reason: str = "user_hangup"

    async def trigger_end(reason: str) -> None:
        nonlocal end_reason
        end_reason = reason
        try:
            session.shutdown(drain=True)
        except Exception as e:
            logger.warning("session_shutdown_failed: %s", e)

    agent = CompanionAgent(user_id=user_id, conversation_id=conversation_id)
    agent.bind_crisis_callback(lambda: trigger_end("agent_crisis_redirect"))

    heartbeat_task = asyncio.create_task(
        heartbeat_loop(
            api_client,
            get_elapsed_seconds=lambda: int(time.monotonic() - start_ts),
            on_should_end=trigger_end,
            interval_seconds=s.heartbeat_interval_seconds,
        )
    )

    try:
        await session.start(
            room=ctx.room,
            agent=agent,
            room_input_options=RoomInputOptions(),
        )
        # session.start() returns once the session is up; wait for it to close.
        await session.wait_for_inactive()
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
