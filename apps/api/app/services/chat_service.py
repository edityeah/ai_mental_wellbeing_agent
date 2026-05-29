from __future__ import annotations

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

    Yields one StreamHeader, then 0..N text chunks, then one StreamFooter.
    Persistence happens between yields.
    """
    settings = get_settings()
    today = datetime.now(tz=timezone.utc).date()

    # 1. Ensure the conversation belongs to this user.
    conv = await repos.get_conversation(
        session, conversation_id=conversation_id, user_id=user_id
    )
    if conv is None:
        raise LookupError("conversation not found")

    # 2. Rate-limit check (raises before any work).
    await consume_text_message_quota(
        session, user_id=user_id, today=today, cap=settings.daily_text_msg_cap
    )

    # 3. Persist the user message immediately.
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

    # 4. Build history (excludes the just-persisted user message because we'll
    #    pass it as the most recent turn explicitly).
    history = await _load_history(session, conversation_id=conversation_id)

    # 5. Safety classifier on the latest user message.
    result: SafetyResult = await safety.classify(
        user_text, history=history[:-1]  # exclude the latest, which is being classified
    )
    user_msg.risk_level = result.risk
    await session.commit()

    # 6. ACUTE → crisis card, stop here.
    if result.risk == "acute":
        crisis_msg: Message = await repos.append_message(
            session,
            conversation_id=conversation_id,
            role="system_crisis",
            content=CRISIS_CARD_TEXT,
            source="text",
            risk_level=None,
            token_count=0,
        )
        await session.commit()
        yield StreamHeader(
            message_id=crisis_msg.id, risk="acute", kind="crisis_card"
        )
        yield CRISIS_CARD_TEXT
        yield StreamFooter(total_tokens=0)
        return

    # 7. Load profile + summary.
    profile_row = await repos.get_or_create_profile(session, user_id=user_id)
    await session.commit()

    # 8. Stream the Companion reply.
    pending_assistant = await repos.append_message(
        session,
        conversation_id=conversation_id,
        role="assistant",
        content="",  # filled in after the stream
        source="text",
        risk_level=None,
        token_count=0,
    )
    await session.commit()

    yield StreamHeader(
        message_id=pending_assistant.id, risk=result.risk, kind="normal"
    )

    collected: list[str] = []
    try:
        async for chunk in companion.stream_reply(
            history=history,
            risk=result.risk,  # type: ignore[arg-type]
            source="text",
            profile=profile_row.profile,
            summary=profile_row.summary,
        ):
            collected.append(chunk)
            yield chunk
    except Exception as e:
        logger.exception("companion_stream_failed: %s", e)
        await session.delete(pending_assistant)
        await session.commit()
        yield "\n\n(Sorry — I had trouble responding. Please try again.)"
        yield StreamFooter(total_tokens=0)
        return

    final_text = "".join(collected).strip()
    pending_assistant.content = final_text
    pending_assistant.token_count = max(1, len(final_text) // 4)
    await session.commit()

    # 9. Auto-title on first user message in this conversation.
    if conv.title == "New conversation":
        new_title = await title_gen.generate_title(user_text)
        conv.title = new_title
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
