"""End-of-call recap: produces a Care Plan summary and persists it as a
`system_recap` message at the end of the conversation."""
from __future__ import annotations

import logging
import uuid

from livekit import rtc

from app.agents.recap import generate_recap
from app.db import repos
from app.db.session import get_sessionmaker
from app.services.chat_service import maybe_run_profile_updater

from worker.companion_llm import (
    TRANSCRIPT_TOPIC,
    _publish_transcript,
)

logger = logging.getLogger(__name__)

# Don't bother generating a recap unless the user actually said something
# substantive — keeps Haiku off short test calls.
_MIN_USER_TURNS = 2
_MIN_TOTAL_CHARS = 80


async def generate_and_persist_recap(
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    room: rtc.Room | None,
) -> None:
    """Loads the conversation, asks Haiku to compose a Care Plan, persists
    it as a `system_recap` message, and publishes it over the LiveKit data
    channel so the chat UI shows it the moment the call ends."""
    sm = get_sessionmaker()
    async with sm() as session:
        msgs = await repos.list_messages(
            session, conversation_id=conversation_id, limit=100
        )

    # Filter to actual conversation, skip system cards.
    relevant = [
        {"role": m.role, "content": m.content}
        for m in msgs
        if m.role in ("user", "assistant")
    ]
    user_turns = sum(1 for m in relevant if m["role"] == "user")
    total_chars = sum(len(m["content"] or "") for m in relevant)

    if user_turns < _MIN_USER_TURNS or total_chars < _MIN_TOTAL_CHARS:
        logger.info(
            "recap_skipped conv=%s user_turns=%d chars=%d (below threshold)",
            conversation_id,
            user_turns,
            total_chars,
        )
        return

    text = await generate_recap(relevant)
    if not text:
        logger.info("recap_no_signal conv=%s", conversation_id)
        return

    # Persist as a system_recap message — the chat UI renders it as a
    # distinct Care Plan card.
    sm = get_sessionmaker()
    async with sm() as session:
        await repos.append_message(
            session,
            conversation_id=conversation_id,
            role="system_recap",
            content=text,
            source="voice",
            risk_level=None,
            token_count=max(1, len(text) // 4),
        )
        await session.commit()

    # Push it live to the room so the bubble lands in the UI without a refetch.
    await _publish_transcript(
        room,
        role="system_recap",
        content=text,
    )
    logger.info("recap_persisted conv=%s len=%d", conversation_id, len(text))

    # Refresh the user's profile from this conversation. Text chat does
    # this per-turn (after every 5 assistant replies); voice fires it
    # once at call end so spoken context (stressors, coping moves, goals
    # named aloud) actually makes it into the profile that the Companion
    # reads next session. Best-effort.
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            await maybe_run_profile_updater(
                session,
                user_id=user_id,
                conversation_id=conversation_id,
                # Lower threshold for voice — a single call rarely has 5
                # assistant turns at the existing per-turn cadence, so
                # require just 1 new assistant message since the last
                # watermark.
                every_n_assistant_replies=1,
            )
        logger.info("profile_updated_from_voice conv=%s", conversation_id)
    except Exception as e:
        logger.warning(
            "voice_profile_update_failed conv=%s err=%s", conversation_id, e
        )
