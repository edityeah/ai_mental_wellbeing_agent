from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import companion, profile_updater, safety, title as title_gen
from app.agents.safety import HistoryTurn
from app.crisis.card import CRISIS_CARD_TEXT
from app.db import repos
from app.db.models import Message
from app.schemas.chat import SafetyResult
from app.services.rate_limit import RateLimitExceeded, consume_text_message_quota
from app.settings import get_settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class StreamHeader:
    message_id: uuid.UUID
    risk: str
    kind: str  # "normal" | "crisis_card"


@dataclass(slots=True)
class StreamFooter:
    total_tokens: int


async def _load_history(
    session: AsyncSession, *, conversation_id: uuid.UUID, max_turns: int = 30
) -> list[HistoryTurn]:
    msgs = await repos.list_messages(
        session, conversation_id=conversation_id, limit=max_turns
    )
    out: list[HistoryTurn] = []
    for m in msgs:
        if m.role in ("user", "assistant"):
            out.append({"role": m.role, "content": m.content})  # type: ignore[arg-type]
    return out


async def run_chat_turn(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    user_text: str,
) -> AsyncIterator[StreamHeader | str | StreamFooter]:
    """Drive a single chat turn.

    OPTIMIZED FLOW: safety classifier and companion stream run **in parallel**.
    Companion tokens are buffered until safety resolves:
    - 'none' → flush + stream
    - 'elevated' → discard speculative companion, restart with elevated prompt
    - 'acute' → cancel companion, send crisis card

    Yields one StreamHeader, then 0..N text chunks, then one StreamFooter.
    """
    settings = get_settings()
    today = datetime.now(tz=timezone.utc).date()

    # 1. Validate conversation belongs to user.
    conv = await repos.get_conversation(
        session, conversation_id=conversation_id, user_id=user_id
    )
    if conv is None:
        raise LookupError("conversation not found")

    # 2. Rate-limit check.
    await consume_text_message_quota(
        session, user_id=user_id, today=today, cap=settings.daily_text_msg_cap
    )

    # 3. Persist the user message.
    user_msg = await repos.append_message(
        session,
        conversation_id=conversation_id,
        role="user",
        content=user_text,
        source="text",
        risk_level=None,
        token_count=max(1, len(user_text) // 4),
    )
    await session.commit()

    # 4. Build history + load profile.
    history = await _load_history(session, conversation_id=conversation_id)
    profile_row = await repos.get_or_create_profile(session, user_id=user_id)
    await session.commit()

    # 5. Persist empty pending assistant row + emit header immediately.
    pending_assistant = await repos.append_message(
        session,
        conversation_id=conversation_id,
        role="assistant",
        content="",
        source="text",
        risk_level=None,
        token_count=0,
    )
    await session.commit()
    yield StreamHeader(message_id=pending_assistant.id, risk="pending", kind="normal")

    # 6. Start safety classifier and companion stream IN PARALLEL.
    safety_task = asyncio.create_task(
        safety.classify(user_text, history=history[:-1])
    )

    async def _consume_companion(
        risk: str,
    ) -> AsyncIterator[str]:
        async for chunk in companion.stream_reply(
            history=history,
            risk=risk,  # type: ignore[arg-type]
            source="text",
            profile=profile_row.profile,
            summary=profile_row.summary,
        ):
            yield chunk

    companion_gen = _consume_companion("none")  # speculative — assume safest path
    buffered: list[str] = []
    final_chunks: list[str] = []
    safety_resolved = False
    safety_result: SafetyResult | None = None
    companion_done = False

    async def _next_token() -> tuple[str, str | None]:
        try:
            return ("token", await companion_gen.__anext__())
        except StopAsyncIteration:
            return ("done", None)

    token_task = asyncio.create_task(_next_token())

    while not companion_done:
        wait_for: list[asyncio.Task] = [token_task]
        if not safety_resolved:
            wait_for.append(safety_task)

        done, _pending = await asyncio.wait(
            wait_for, return_when=asyncio.FIRST_COMPLETED
        )

        # Handle safety resolution first if it just landed.
        if not safety_resolved and safety_task in done:
            safety_resolved = True
            safety_result = safety_task.result()
            user_msg.risk_level = safety_result.risk
            await session.commit()

            if safety_result.risk == "acute":
                # Cancel speculative companion.
                token_task.cancel()
                try:
                    await companion_gen.aclose()
                except Exception:
                    pass
                # Persist crisis card as system_crisis, drop the empty assistant.
                crisis_msg = await repos.append_message(
                    session,
                    conversation_id=conversation_id,
                    role="system_crisis",
                    content=CRISIS_CARD_TEXT,
                    source="text",
                    risk_level=None,
                    token_count=0,
                )
                await session.delete(pending_assistant)
                await session.commit()
                yield StreamHeader(
                    message_id=crisis_msg.id, risk="acute", kind="crisis_card"
                )
                yield CRISIS_CARD_TEXT
                yield StreamFooter(total_tokens=0)
                return

            if safety_result.risk == "elevated":
                # Speculative companion used 'none' prompt — restart with elevated.
                token_task.cancel()
                try:
                    await companion_gen.aclose()
                except Exception:
                    pass
                buffered = []
                companion_gen = _consume_companion("elevated")
                token_task = asyncio.create_task(_next_token())
                continue

            # safety = 'none' → flush any buffered tokens.
            for tok in buffered:
                final_chunks.append(tok)
                yield tok
            buffered = []

        # Handle the next companion token (if it landed).
        if token_task in done:
            kind, value = token_task.result()
            if kind == "done":
                companion_done = True
                break
            assert value is not None
            if safety_resolved:
                final_chunks.append(value)
                yield value
            else:
                buffered.append(value)
            token_task = asyncio.create_task(_next_token())

    # 7. Save final reply.
    final_text = "".join(final_chunks).strip()
    pending_assistant.content = final_text
    pending_assistant.token_count = max(1, len(final_text) // 4)
    await session.commit()

    yield StreamFooter(total_tokens=pending_assistant.token_count)


async def maybe_run_profile_updater(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    every_n_assistant_replies: int = 5,
) -> None:
    """Run the profile updater if there have been enough new assistant replies
    since the watermark. Safe to call after every chat turn."""
    profile_row = await repos.get_or_create_profile(session, user_id=user_id)
    msgs = await repos.list_messages(
        session, conversation_id=conversation_id, limit=200
    )
    if not msgs:
        return

    unprocessed: list[Message] = []
    seen_watermark = profile_row.last_processed_msg_id is None
    for m in msgs:
        if not seen_watermark:
            if m.id == profile_row.last_processed_msg_id:
                seen_watermark = True
            continue
        unprocessed.append(m)

    new_assistant_count = sum(1 for m in unprocessed if m.role == "assistant")
    if new_assistant_count < every_n_assistant_replies:
        return

    history: list[HistoryTurn] = [
        {"role": m.role, "content": m.content}  # type: ignore[misc]
        for m in unprocessed
        if m.role in ("user", "assistant")
    ]
    update = await profile_updater.update_profile(
        current_profile=profile_row.profile,
        current_summary=profile_row.summary,
        recent_messages=history,
    )
    if update is None:
        return
    profile_row.profile = update.profile
    profile_row.summary = update.summary
    profile_row.last_processed_msg_id = msgs[-1].id
    await session.commit()


async def maybe_generate_title(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    first_user_text: str,
) -> None:
    """Generate an auto-title for a conversation if it still has the default title.

    Runs as a background task so it doesn't extend the chat-turn latency.
    """
    conv = await repos.get_conversation(
        session, conversation_id=conversation_id, user_id=user_id
    )
    if conv is None or conv.title != "New conversation":
        return
    new_title = await title_gen.generate_title(first_user_text)
    conv.title = new_title
    await session.commit()
