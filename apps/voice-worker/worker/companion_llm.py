"""Custom LLM wrapper for livekit-agents.

The framework's voice pipeline (STT → LLM → TTS) requires `llm` to be set on
AgentSession; otherwise it silently skips agent responses. Instead of wiring
a real OpenAI/Anthropic LLM (we already have one — `app.agents.companion`),
we wrap our existing `companion.stream_reply` as a `livekit.agents.llm.LLM`.

This is also where the per-turn safety classifier runs, mirroring the text
chat's flow:
    user text → safety.classify → either crisis card OR companion.stream_reply
The output is streamed as `ChatChunk(delta=ChoiceDelta(content=...))` items
through the framework's TTS pipeline.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from livekit import rtc
from livekit.agents.llm import (
    ChatChunk,
    ChatContext,
    ChoiceDelta,
    LLM,
    LLMStream,
    Tool,
)
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    APIConnectOptions,
    NotGivenOr,
)

from app.agents import companion, safety
from app.crisis.card import CRISIS_CARD_TEXT
from app.db import repos
from app.db.session import get_sessionmaker
from app.services.chat_service import maybe_generate_title

# Topic used for live transcript data messages on the LiveKit room. The web
# client listens on this topic and appends bubbles to the chat thread in
# real time, so the call feels like an extension of the conversation rather
# than a side-channel.
TRANSCRIPT_TOPIC = "mwc-transcript"


async def _publish_transcript(
    room: rtc.Room | None,
    *,
    role: str,
    content: str,
    msg_id: str | None = None,
) -> None:
    """Publish a complete turn as a single bubble. Best-effort; never
    raises into the agent loop."""
    if room is None or not content.strip():
        return
    try:
        payload = json.dumps(
            {
                "type": "transcript",
                "role": role,
                "content": content,
                "id": msg_id,
            }
        ).encode("utf-8")
        await room.local_participant.publish_data(
            payload,
            reliable=True,
            topic=TRANSCRIPT_TOPIC,
        )
    except Exception as e:
        logger.warning("publish_transcript_failed role=%s err=%s", role, e)


async def _publish_transcript_delta(
    room: rtc.Room | None,
    *,
    msg_id: str,
    role: str,
    delta: str,
) -> None:
    """Publish a streaming chunk for a bubble that's still filling in.
    The frontend looks up the bubble by msg_id and appends `delta` to its
    content — giving the same typewriter feel as the text chat."""
    if room is None or not delta:
        return
    try:
        payload = json.dumps(
            {
                "type": "transcript_delta",
                "id": msg_id,
                "role": role,
                "delta": delta,
            }
        ).encode("utf-8")
        await room.local_participant.publish_data(
            payload,
            reliable=True,
            topic=TRANSCRIPT_TOPIC,
        )
    except Exception as e:
        logger.warning("publish_delta_failed id=%s err=%s", msg_id, e)


async def _publish_transcript_end(
    room: rtc.Room | None,
    *,
    msg_id: str,
    role: str,
    final_content: str,
) -> None:
    """Tell the frontend the streaming bubble is complete (replace with
    the canonical final text — covers any deltas that were dropped)."""
    if room is None or not final_content.strip():
        return
    try:
        payload = json.dumps(
            {
                "type": "transcript_end",
                "id": msg_id,
                "role": role,
                "content": final_content,
            }
        ).encode("utf-8")
        await room.local_participant.publish_data(
            payload,
            reliable=True,
            topic=TRANSCRIPT_TOPIC,
        )
    except Exception as e:
        logger.warning("publish_end_failed id=%s err=%s", msg_id, e)

logger = logging.getLogger(__name__)


def _extract_last_user_text(chat_ctx: ChatContext) -> str:
    """Pull the most recent user message's text out of the chat context."""
    for item in reversed(chat_ctx.items):
        # ChatItem has type, role, content (list of str / images). Skip non-messages.
        if getattr(item, "role", None) != "user":
            continue
        content = getattr(item, "content", None)
        if content is None:
            continue
        if isinstance(content, str):
            return content.strip()
        # Most commonly list[str | ImageContent]
        parts: list[str] = []
        for piece in content:
            if isinstance(piece, str):
                parts.append(piece)
        return " ".join(parts).strip()
    return ""


async def _load_history(conversation_id: uuid.UUID) -> list[dict]:
    sm = get_sessionmaker()
    async with sm() as session:
        msgs = await repos.list_messages(
            session, conversation_id=conversation_id, limit=30
        )
        out: list[dict] = []
        for m in msgs:
            if m.role in ("user", "assistant"):
                out.append({"role": m.role, "content": m.content})
        return out


async def _load_profile(user_id: uuid.UUID) -> tuple[dict, str]:
    sm = get_sessionmaker()
    async with sm() as session:
        row = await repos.get_or_create_profile(session, user_id=user_id)
        await session.commit()
        return row.profile, row.summary


async def _persist_turn(
    *,
    conversation_id: uuid.UUID,
    role: str,
    content: str,
    risk_level: str | None,
) -> None:
    sm = get_sessionmaker()
    async with sm() as session:
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


class CompanionLLMStream(LLMStream):
    def __init__(
        self,
        llm: LLM,
        *,
        chat_ctx: ChatContext,
        tools: list[Tool],
        conn_options: APIConnectOptions,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        room: rtc.Room | None = None,
    ) -> None:
        super().__init__(
            llm,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )
        self._user_id = user_id
        self._conversation_id = conversation_id
        self._room = room

    async def _run(self) -> None:
        user_text = _extract_last_user_text(self._chat_ctx)
        if not user_text:
            # Greeting path — generate_reply with instructions= (no user
            # message yet). Yield a short opener so TTS has something to
            # speak; otherwise the session immediately ends.
            logger.info("companion_llm_greeting")
            greeting = "Hey. I'm here whenever you're ready."
            chunk_id = uuid.uuid4().hex
            self._event_ch.send_nowait(
                ChatChunk(
                    id=chunk_id,
                    delta=ChoiceDelta(role="assistant", content=greeting),
                )
            )
            return

        t0 = time.monotonic()
        logger.info(
            "companion_llm_run user_id=%s text=%r",
            self._user_id,
            user_text[:80],
        )

        # Publish the user's spoken turn to the chat thread immediately —
        # gives the user the same "I see what I just said" confirmation
        # they get when typing, without waiting on safety/companion.
        asyncio.create_task(
            _publish_transcript(self._room, role="user", content=user_text)
        )

        # Load conversation history (older turns, not including this user turn)
        history = await _load_history(self._conversation_id)

        # First voice turn → kick off auto-title generation in the background
        # so the sidebar shows a meaningful name instead of "New conversation".
        # Mirrors the text-chat router behavior. No-op if a title is already set.
        if not history:
            async def _bg_title() -> None:
                sm = get_sessionmaker()
                async with sm() as bg:
                    try:
                        await maybe_generate_title(
                            bg,
                            user_id=self._user_id,
                            conversation_id=self._conversation_id,
                            first_user_text=user_text,
                        )
                    except Exception as e:
                        logger.warning("voice_title_bg_failed: %s", e)

            asyncio.create_task(_bg_title())

        # ── Latency optimization ────────────────────────────────────────
        # Run safety + profile + companion stream in PARALLEL instead of
        # sequentially. The previous flow waited ~2s on Haiku before even
        # starting Sonnet's first token — every voice turn felt slow.
        #
        # Strategy:
        #   1. Kick off safety + profile concurrently.
        #   2. Block on profile (typically <50ms, needed for companion prompt).
        #   3. Start the companion stream optimistically with risk="none".
        #   4. Buffer the first chunks for up to BUFFER_WINDOW_S while we
        #      wait for safety to settle.
        #   5. As soon as safety returns:
        #        - acute → discard buffer, send crisis card instead
        #        - else  → flush buffer + continue streaming live
        #   6. If safety hasn't returned within BUFFER_WINDOW_S, give up
        #      waiting and start streaming — we re-check the safety result
        #      after the response completes (extremely rare miss path).
        # ────────────────────────────────────────────────────────────────
        BUFFER_WINDOW_S = 0.8  # max time to hold companion output for safety

        safety_task: asyncio.Task = asyncio.create_task(
            safety.classify(user_text, history=history)
        )
        profile_task: asyncio.Task = asyncio.create_task(
            _load_profile(self._user_id)
        )

        try:
            profile, summary = await profile_task
        except Exception as e:
            logger.warning("load_profile_failed: %s", e)
            profile, summary = {}, ""

        history_with_user = history + [{"role": "user", "content": user_text}]
        chunk_id = uuid.uuid4().hex
        collected: list[str] = []
        buffered: list[str] = []
        flushed = False
        crisis_sent = False
        deadline = time.monotonic() + BUFFER_WINDOW_S

        def _safety_done() -> bool:
            return safety_task.done()

        def _get_safety_result():
            """Returns SafetyResult or None if task hasn't finished."""
            if not safety_task.done():
                return None
            try:
                return safety_task.result()
            except Exception as e:
                logger.warning("safety_classify_failed: %s", e)
                from app.schemas.chat import SafetyResult
                return SafetyResult(risk="elevated", reason="classifier_error")

        async def _send_crisis() -> None:
            nonlocal crisis_sent
            crisis_sent = True
            self._event_ch.send_nowait(
                ChatChunk(
                    id=chunk_id,
                    delta=ChoiceDelta(
                        role="assistant", content=CRISIS_CARD_TEXT
                    ),
                )
            )

        try:
            async for piece in companion.stream_reply(
                history=history_with_user,  # type: ignore[arg-type]
                # Optimistically use "none" — we don't yet know risk.
                # Acute is handled post-hoc by discarding output and
                # swapping for the crisis card. Elevated and none use
                # near-identical tone in the base prompt, so the loss is
                # acceptable for the latency win.
                risk="none",
                source="voice",
                profile=profile,
                summary=summary,
            ):
                if not piece:
                    continue

                # Until safety has spoken (or the window expires), buffer.
                if not flushed:
                    sr = _get_safety_result()
                    if sr is None and time.monotonic() < deadline:
                        buffered.append(piece)
                        continue
                    # Safety settled OR we hit the buffer deadline.
                    if sr is not None and sr.risk == "acute":
                        await _send_crisis()
                        logger.info(
                            "companion_llm_acute_intercepted ms=%d",
                            int((time.monotonic() - t0) * 1000),
                        )
                        # Drain the rest of the companion stream so we don't
                        # leak the task — but throw away the output.
                        # (Falling out of the for loop achieves this; just
                        # break.)
                        break
                    # Safe to flush
                    for b in buffered:
                        collected.append(b)
                        self._event_ch.send_nowait(
                            ChatChunk(
                                id=chunk_id,
                                delta=ChoiceDelta(
                                    role="assistant", content=b
                                ),
                            )
                        )
                        # Stream the buffered chunks into the chat thread
                        # too — so the bubble starts filling in as the TTS
                        # starts speaking.
                        asyncio.create_task(
                            _publish_transcript_delta(
                                self._room,
                                msg_id=chunk_id,
                                role="assistant",
                                delta=b,
                            )
                        )
                    buffered.clear()
                    flushed = True

                collected.append(piece)
                self._event_ch.send_nowait(
                    ChatChunk(
                        id=chunk_id,
                        delta=ChoiceDelta(role="assistant", content=piece),
                    )
                )
                # Live-stream this chunk into the chat thread (typewriter).
                asyncio.create_task(
                    _publish_transcript_delta(
                        self._room,
                        msg_id=chunk_id,
                        role="assistant",
                        delta=piece,
                    )
                )
        except Exception as e:
            logger.exception("companion_stream_failed: %s", e)
            self._event_ch.send_nowait(
                ChatChunk(
                    id=chunk_id,
                    delta=ChoiceDelta(
                        role="assistant",
                        content=(
                            "I'm having trouble responding right now. "
                            "Try again in a moment."
                        ),
                    ),
                )
            )
            # Still try to record what safety said
            try:
                await safety_task
            except Exception:
                pass
            return

        # Ensure safety result is in (it usually was by the time the
        # stream finished). If it's still pending, await it now.
        if not safety_task.done():
            try:
                await safety_task
            except Exception:
                pass
        final_safety = _get_safety_result()
        if final_safety is None:
            from app.schemas.chat import SafetyResult
            final_safety = SafetyResult(risk="elevated", reason="unknown")

        # If we buffered everything (stream finished inside the window) and
        # never flushed, handle the final decision now.
        if not flushed and not crisis_sent:
            if final_safety.risk == "acute":
                await _send_crisis()
            else:
                for b in buffered:
                    collected.append(b)
                    self._event_ch.send_nowait(
                        ChatChunk(
                            id=chunk_id,
                            delta=ChoiceDelta(role="assistant", content=b),
                        )
                    )
                buffered.clear()
                flushed = True

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "companion_llm_done risk=%s ms=%d chunks=%d crisis=%s",
            final_safety.risk,
            elapsed_ms,
            len(collected),
            crisis_sent,
        )

        # Persist user turn with final risk label.
        try:
            await _persist_turn(
                conversation_id=self._conversation_id,
                role="user",
                content=user_text,
                risk_level=final_safety.risk,
            )
        except Exception as e:
            logger.warning("persist_user_failed: %s", e)

        # Persist crisis card OR the assistant turn.
        if crisis_sent:
            try:
                await _persist_turn(
                    conversation_id=self._conversation_id,
                    role="system_crisis",
                    content=CRISIS_CARD_TEXT,
                    risk_level=None,
                )
            except Exception as e:
                logger.warning("persist_crisis_failed: %s", e)
            # Mirror crisis card into the chat thread too.
            await _publish_transcript(
                self._room,
                role="system_crisis",
                content=CRISIS_CARD_TEXT,
            )
            return

        final_text = "".join(collected).strip()
        if final_text:
            try:
                await _persist_turn(
                    conversation_id=self._conversation_id,
                    role="assistant",
                    content=final_text,
                    risk_level=None,
                )
            except Exception as e:
                logger.warning("persist_assistant_failed: %s", e)
            # Final flush — replace the streaming bubble's content with the
            # canonical text (covers any deltas that were dropped in flight).
            await _publish_transcript_end(
                self._room,
                msg_id=chunk_id,
                role="assistant",
                final_content=final_text,
            )


class CompanionLLM(LLM):
    def __init__(
        self,
        *,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        room: rtc.Room | None = None,
    ) -> None:
        super().__init__()
        self._user_id = user_id
        self._conversation_id = conversation_id
        self._room = room

    @property
    def provider(self) -> str:  # type: ignore[override]
        return "mwc-companion"

    @property
    def model(self) -> str:  # type: ignore[override]
        return "claude-sonnet-4-6"

    def chat(
        self,
        *,
        chat_ctx: ChatContext,
        tools: list[Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        tool_choice: NotGivenOr[Any] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[dict[str, Any]] = NOT_GIVEN,
    ) -> LLMStream:
        return CompanionLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
            user_id=self._user_id,
            conversation_id=self._conversation_id,
            room=self._room,
        )
