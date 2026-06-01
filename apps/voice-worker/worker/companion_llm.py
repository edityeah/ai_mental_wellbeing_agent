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

import logging
import uuid
from typing import Any

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
    ) -> None:
        super().__init__(
            llm,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )
        self._user_id = user_id
        self._conversation_id = conversation_id

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

        logger.info(
            "companion_llm_run user_id=%s text=%r",
            self._user_id,
            user_text[:80],
        )

        # Load conversation history (older turns, not including this user turn)
        history = await _load_history(self._conversation_id)

        # Safety classifier
        try:
            result = await safety.classify(user_text, history=history)
        except Exception as e:
            logger.warning("safety_classify_failed: %s", e)
            from app.schemas.chat import SafetyResult
            result = SafetyResult(risk="elevated", reason="classifier_error")

        # Persist the user turn
        try:
            await _persist_turn(
                conversation_id=self._conversation_id,
                role="user",
                content=user_text,
                risk_level=result.risk,
            )
        except Exception as e:
            logger.warning("persist_user_failed: %s", e)
        logger.info("companion_llm_safety risk=%s", result.risk)

        # ACUTE: stream the crisis card and stop (no companion turn).
        if result.risk == "acute":
            await _persist_turn(
                conversation_id=self._conversation_id,
                role="system_crisis",
                content=CRISIS_CARD_TEXT,
                risk_level=None,
            )
            chunk_id = uuid.uuid4().hex
            self._event_ch.send_nowait(
                ChatChunk(
                    id=chunk_id,
                    delta=ChoiceDelta(role="assistant", content=CRISIS_CARD_TEXT),
                )
            )
            return

        # Normal / elevated: stream the companion's reply.
        try:
            profile, summary = await _load_profile(self._user_id)
        except Exception as e:
            logger.warning("load_profile_failed: %s", e)
            profile, summary = {}, ""

        history_with_user = history + [{"role": "user", "content": user_text}]
        chunk_id = uuid.uuid4().hex
        collected: list[str] = []
        try:
            async for piece in companion.stream_reply(
                history=history_with_user,  # type: ignore[arg-type]
                risk=result.risk,  # type: ignore[arg-type]
                source="voice",
                profile=profile,
                summary=summary,
            ):
                if not piece:
                    continue
                collected.append(piece)
                self._event_ch.send_nowait(
                    ChatChunk(
                        id=chunk_id,
                        delta=ChoiceDelta(role="assistant", content=piece),
                    )
                )
        except Exception as e:
            logger.exception("companion_stream_failed: %s", e)
            # Send a friendly fallback so the user hears SOMETHING
            self._event_ch.send_nowait(
                ChatChunk(
                    id=chunk_id,
                    delta=ChoiceDelta(
                        role="assistant",
                        content="I'm having trouble responding right now. Try again in a moment.",
                    ),
                )
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


class CompanionLLM(LLM):
    def __init__(
        self, *, user_id: uuid.UUID, conversation_id: uuid.UUID
    ) -> None:
        super().__init__()
        self._user_id = user_id
        self._conversation_id = conversation_id

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
        )
