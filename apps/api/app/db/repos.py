from __future__ import annotations

import uuid
from datetime import date

from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Conversation,
    Message,
    UsageDaily,
    UserProfile,
    VoiceSession,
)


async def create_conversation(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    title: str = "New conversation",
) -> Conversation:
    conv = Conversation(user_id=user_id, title=title)
    session.add(conv)
    await session.flush()
    return conv


async def list_conversations(
    session: AsyncSession, *, user_id: uuid.UUID
) -> list[Conversation]:
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.archived_at.is_(None))
        .order_by(Conversation.last_msg_at.desc())
    )
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def get_conversation(
    session: AsyncSession, *, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> Conversation | None:
    stmt = select(Conversation).where(
        Conversation.id == conversation_id, Conversation.user_id == user_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def rename_conversation(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
) -> Conversation | None:
    conv = await get_conversation(
        session, conversation_id=conversation_id, user_id=user_id
    )
    if conv is None:
        return None
    conv.title = title
    await session.flush()
    return conv


async def append_message(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    role: str,
    content: str,
    source: str,
    risk_level: str | None,
    token_count: int,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        source=source,
        risk_level=risk_level,
        token_count=token_count,
    )
    session.add(msg)
    await session.flush()

    await session.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(last_msg_at=msg.created_at)
    )
    return msg


async def list_messages(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    limit: int = 50,
    before: uuid.UUID | None = None,
) -> list[Message]:
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        anchor = await session.get(Message, before)
        if anchor is not None:
            stmt = stmt.where(Message.created_at < anchor.created_at)
    res = await session.execute(stmt)
    return list(reversed(res.scalars().all()))


async def get_or_create_profile(
    session: AsyncSession, *, user_id: uuid.UUID
) -> UserProfile:
    stmt = select(UserProfile).where(UserProfile.user_id == user_id)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return existing
    profile = UserProfile(user_id=user_id, profile={}, summary="")
    session.add(profile)
    await session.flush()
    return profile


async def update_profile(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    profile: dict,
    summary: str,
    last_processed_msg_id: uuid.UUID,
) -> UserProfile:
    row = await get_or_create_profile(session, user_id=user_id)
    row.profile = profile
    row.summary = summary
    row.last_processed_msg_id = last_processed_msg_id
    await session.flush()
    return row


async def get_or_create_usage_today(
    session: AsyncSession, *, user_id: uuid.UUID, today: date
) -> UsageDaily:
    stmt = select(UsageDaily).where(
        UsageDaily.user_id == user_id, UsageDaily.date == today
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return existing
    row = UsageDaily(user_id=user_id, date=today)
    session.add(row)
    await session.flush()
    return row


async def increment_text_msg_count(
    session: AsyncSession, *, user_id: uuid.UUID, today: date
) -> int:
    row = await get_or_create_usage_today(session, user_id=user_id, today=today)
    row.text_msg_count += 1
    await session.flush()
    return row.text_msg_count


async def create_voice_session(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    room_name: str,
) -> VoiceSession:
    row = VoiceSession(
        user_id=user_id,
        conversation_id=conversation_id,
        room_name=room_name,
    )
    session.add(row)
    await session.flush()
    return row


async def get_voice_session_by_room(
    session: AsyncSession, *, room_name: str
) -> VoiceSession | None:
    stmt = select(VoiceSession).where(VoiceSession.room_name == room_name)
    return (await session.execute(stmt)).scalar_one_or_none()


async def end_voice_session(
    session: AsyncSession,
    *,
    room_name: str,
    duration_seconds: int,
    end_reason: str,
    audio_egress_url: str | None,
) -> VoiceSession | None:
    row = await get_voice_session_by_room(session, room_name=room_name)
    if row is None:
        return None
    row.ended_at = datetime.now(tz=timezone.utc)
    row.duration_seconds = duration_seconds
    row.end_reason = end_reason
    row.audio_egress_url = audio_egress_url
    await session.flush()
    return row


async def get_voice_seconds_today(
    session: AsyncSession, *, user_id: uuid.UUID, today: date
) -> int:
    stmt = select(UsageDaily.voice_seconds).where(
        UsageDaily.user_id == user_id, UsageDaily.date == today
    )
    val = (await session.execute(stmt)).scalar_one_or_none()
    return int(val or 0)


async def increment_voice_seconds(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    today: date,
    delta_seconds: int,
) -> int:
    row = await get_or_create_usage_today(session, user_id=user_id, today=today)
    row.voice_seconds += int(delta_seconds)
    await session.flush()
    return row.voice_seconds


async def total_voice_seconds_today_global(
    session: AsyncSession, *, today: date
) -> int:
    stmt = select(func.coalesce(func.sum(UsageDaily.voice_seconds), 0)).where(
        UsageDaily.date == today
    )
    val = (await session.execute(stmt)).scalar_one()
    return int(val or 0)
