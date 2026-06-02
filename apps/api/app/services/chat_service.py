from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import (
    companion,
    profile_updater,
    recap as recap_gen,
    safety,
    title as title_gen,
)
from app.db.models import MoodCheckin
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


def _data_url_to_claude_image_block(data_url: str) -> dict | None:
    """Convert a 'data:image/png;base64,XXXX' URL into Claude's image
    content block shape. Returns None for malformed input."""
    try:
        if not data_url.startswith("data:"):
            return None
        header, _, payload = data_url.partition(",")
        # header is "data:image/png;base64"
        meta = header[5:]  # drop "data:"
        if ";base64" not in meta:
            return None
        mime = meta.split(";")[0]
        if mime not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
            return None
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": mime,
                "data": payload,
            },
        }
    except Exception:
        return None


async def _load_history(
    session: AsyncSession, *, conversation_id: uuid.UUID, max_turns: int = 30
) -> list[HistoryTurn]:
    """Build Claude messages from DB rows. User messages with image
    attachments become multi-part content (image blocks + text block)
    so Claude can actually "see" what was shared."""
    msgs = await repos.list_messages(
        session, conversation_id=conversation_id, limit=max_turns
    )
    out: list[HistoryTurn] = []
    for m in msgs:
        if m.role not in ("user", "assistant"):
            continue
        attachments = m.attachments or []
        image_blocks: list[dict] = []
        if m.role == "user" and attachments:
            for a in attachments:
                if isinstance(a, dict) and a.get("kind") == "image":
                    block = _data_url_to_claude_image_block(
                        a.get("data_url") or ""
                    )
                    if block:
                        image_blocks.append(block)
        if image_blocks:
            # Multi-part content: images first, then the user's text.
            content_blocks: list[dict] = list(image_blocks)
            if m.content:
                content_blocks.append({"type": "text", "text": m.content})
            out.append({"role": m.role, "content": content_blocks})  # type: ignore[arg-type]
        else:
            out.append({"role": m.role, "content": m.content})  # type: ignore[arg-type]
    return out


async def _load_mood_today(
    session: AsyncSession, *, user_id: uuid.UUID
) -> dict | None:
    """Today's mood check-in for the user, if they submitted one. Used to
    calibrate the Companion's tone — slower for 1-2, lighter for 4-5."""
    today = datetime.now(tz=timezone.utc).date()
    row = (
        await session.execute(
            select(MoodCheckin).where(
                MoodCheckin.user_id == user_id,
                MoodCheckin.date == today,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    return {"score": row.score, "note": row.note}


async def run_chat_turn(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    user_text: str,
    attachments: list[dict] | None = None,
) -> AsyncIterator[StreamHeader | str | StreamFooter]:
    """Drive a single chat turn — sequential, reliable.

    1. Persist user message
    2. Run safety classifier
    3. If acute → crisis card, return
    4. Persist empty assistant row, emit StreamHeader
    5. Stream companion tokens
    6. Save final content, emit StreamFooter
    """
    settings = get_settings()
    today = datetime.now(tz=timezone.utc).date()

    # Validate conversation
    conv = await repos.get_conversation(
        session, conversation_id=conversation_id, user_id=user_id
    )
    if conv is None:
        raise LookupError("conversation not found")

    # Rate-limit
    await consume_text_message_quota(
        session, user_id=user_id, today=today, cap=settings.daily_text_msg_cap
    )

    # Persist user message (including any image attachments — base64 data
    # URLs stored in JSONB so we can re-render them on later loads and
    # pass them to Claude vision for follow-up turns).
    user_msg = await repos.append_message(
        session,
        conversation_id=conversation_id,
        role="user",
        content=user_text,
        source="text",
        risk_level=None,
        token_count=max(1, len(user_text) // 4),
        attachments=attachments or None,
    )
    await session.commit()

    # Build history + load profile + today's mood reading (if any)
    history = await _load_history(session, conversation_id=conversation_id)
    profile_row = await repos.get_or_create_profile(session, user_id=user_id)
    mood_today = await _load_mood_today(session, user_id=user_id)
    await session.commit()

    # Safety classifier (sequential — wait for result)
    safety_result: SafetyResult = await safety.classify(
        user_text, history=history[:-1]
    )
    user_msg.risk_level = safety_result.risk
    await session.commit()

    # ACUTE → crisis card, stop here
    if safety_result.risk == "acute":
        crisis_msg = await repos.append_message(
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

    # Persist empty assistant row, emit header immediately
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
    yield StreamHeader(
        message_id=pending_assistant.id, risk=safety_result.risk, kind="normal"
    )

    # Stream companion
    collected: list[str] = []
    try:
        async for chunk in companion.stream_reply(
            history=history,
            risk=safety_result.risk,  # type: ignore[arg-type]
            source="text",
            profile=profile_row.profile,
            summary=profile_row.summary,
            mood_today=mood_today,
        ):
            collected.append(chunk)
            yield chunk
    except Exception as e:
        logger.exception("companion_stream_failed: %s", e)
        # Delete the empty pending assistant rather than leave a half-row.
        await session.delete(pending_assistant)
        await session.commit()
        yield "\n\n(Sorry — I had trouble responding. Please try again.)"
        yield StreamFooter(total_tokens=0)
        return

    # Save final content
    final_text = "".join(collected).strip()
    if not final_text:
        # Companion yielded nothing — don't leave a phantom empty row.
        await session.delete(pending_assistant)
        await session.commit()
        yield "\n\n(Sorry — I had trouble responding. Please try again.)"
        yield StreamFooter(total_tokens=0)
        return

    pending_assistant.content = final_text
    pending_assistant.token_count = max(1, len(final_text) // 4)
    await session.commit()

    yield StreamFooter(total_tokens=pending_assistant.token_count)


async def maybe_run_profile_updater(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    every_n_assistant_replies: int = 2,
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
    first_user_text: str | None = None,
) -> None:
    """Auto-title a conversation if it still has the default title and
    enough has been said to extract a topic.

    Tries every time it's called (cheap — Haiku, ~30 output tokens).
    Returns early if:
      * the conversation already has a non-default title (someone or
        a prior run titled it)
      * the only content is a one-liner like "hello" / "can you hear me?"
        — Haiku has nothing to work with and would just return the
        default sentinel again

    Runs as a background task so it doesn't extend chat-turn latency.
    """
    conv = await repos.get_conversation(
        session, conversation_id=conversation_id, user_id=user_id
    )
    if conv is None or conv.title != "New conversation":
        return

    # Pull the first ~6 messages — enough for a Haiku to spot the theme,
    # not so many it wastes tokens. Skip system_crisis cards (they're
    # canned text, not user content).
    msgs = await repos.list_messages(
        session, conversation_id=conversation_id, limit=6
    )
    relevant = [m for m in msgs if m.role in ("user", "assistant")]
    if not relevant:
        return

    # Need some real substance before titling — a single "Hello?" gives
    # Haiku no topic to extract. Heuristic: at least one message with
    # 25+ characters of content.
    has_substance = any(len((m.content or "").strip()) >= 25 for m in relevant)
    if not has_substance:
        # Fall back to the caller-provided first message if it has body.
        if first_user_text and len(first_user_text.strip()) >= 25:
            excerpt = f"User: {first_user_text.strip()}"
        else:
            return  # Try again next turn.
    else:
        lines: list[str] = []
        for m in relevant:
            label = "User" if m.role == "user" else "Companion"
            lines.append(f"{label}: {(m.content or '').strip()}")
        excerpt = "\n".join(lines)

    new_title = await title_gen.generate_title(excerpt)
    if new_title == "New conversation":
        # Model couldn't title it from what we showed. Leave the default
        # so the next turn gets another shot with more context.
        return
    conv.title = new_title
    await session.commit()


# ── Recap (Care Plan) for text chat ──────────────────────────────────────
# Voice fires recap at call end (one obvious "session boundary"). Text has
# no natural boundary, so we instead refresh the recap on a cadence:
#   • Wait until the conversation has real substance
#     (>= MIN_USER_TURNS user turns, >= MIN_TOTAL_CHARS of content)
#   • Only generate a *new* recap if 5+ new user turns have happened
#     since the last recap, OR if there's no recap yet
# A new recap is appended as a new system_recap message; older ones stay
# in the thread so the user can see how their plan has evolved.

_TEXT_RECAP_MIN_USER_TURNS = 4
_TEXT_RECAP_MIN_TOTAL_CHARS = 300
_TEXT_RECAP_NEW_TURNS_THRESHOLD = 5


async def maybe_generate_recap(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
) -> None:
    """Generate a Care Plan recap for a text conversation if it's reached
    enough substance since the last recap. Safe to call after every turn —
    short-circuits cheaply when there's nothing new to recap."""
    conv = await repos.get_conversation(
        session, conversation_id=conversation_id, user_id=user_id
    )
    if conv is None:
        return

    msgs = await repos.list_messages(
        session, conversation_id=conversation_id, limit=200
    )
    if not msgs:
        return

    relevant = [m for m in msgs if m.role in ("user", "assistant")]
    user_turns = sum(1 for m in relevant if m.role == "user")
    total_chars = sum(len((m.content or "").strip()) for m in relevant)

    if (
        user_turns < _TEXT_RECAP_MIN_USER_TURNS
        or total_chars < _TEXT_RECAP_MIN_TOTAL_CHARS
    ):
        return

    # Find the last existing recap (if any) and count user turns since.
    last_recap = next(
        (m for m in reversed(msgs) if m.role == "system_recap"), None
    )
    if last_recap is not None:
        new_user_turns_since = sum(
            1
            for m in msgs
            if m.role == "user" and m.created_at > last_recap.created_at
        )
        if new_user_turns_since < _TEXT_RECAP_NEW_TURNS_THRESHOLD:
            return

    text = await recap_gen.generate_recap(
        [{"role": m.role, "content": m.content} for m in relevant]
    )
    if not text:
        return

    await repos.append_message(
        session,
        conversation_id=conversation_id,
        role="system_recap",
        content=text,
        source="text",
        risk_level=None,
        token_count=max(1, len(text) // 4),
    )
    await session.commit()
