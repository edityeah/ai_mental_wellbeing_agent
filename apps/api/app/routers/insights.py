"""Insights endpoint — surfaces the user's accumulated context (profile +
recent Care Plans) across all conversations. This is what the /insights
page in the web app reads."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims
from app.db import repos
from app.db.models import Conversation, Message
from app.deps import CurrentUser, DBSession

router = APIRouter()


class RecapItem(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    conversation_title: str
    source: str
    content: str
    created_at: datetime


class InsightsOut(BaseModel):
    profile: dict[str, Any]
    summary: str
    recent_recaps: list[RecapItem]


@router.get("/insights", response_model=InsightsOut)
async def get_insights(
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> InsightsOut:
    """Profile snapshot + the user's last 10 Care Plans across all of
    their conversations, newest first."""
    profile_row = await repos.get_or_create_profile(
        session, user_id=claims.user_id
    )
    await session.commit()

    # Join messages → conversations for ownership + title in one query.
    stmt = (
        select(Message, Conversation.title)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.user_id == claims.user_id,
            Message.role == "system_recap",
        )
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    rows = (await session.execute(stmt)).all()

    recaps = [
        RecapItem(
            id=m.id,
            conversation_id=m.conversation_id,
            conversation_title=title,
            source=m.source,
            content=m.content,
            created_at=m.created_at,
        )
        for m, title in rows
    ]

    return InsightsOut(
        profile=profile_row.profile or {},
        summary=profile_row.summary or "",
        recent_recaps=recaps,
    )
