from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims
from app.db import repos
from app.deps import CurrentUser, DBSession
from app.schemas.chat import (
    ConversationCreate,
    ConversationOut,
    ConversationRename,
    MessageOut,
)

router = APIRouter()


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> list[ConversationOut]:
    items = await repos.list_conversations(session, user_id=claims.user_id)
    return [
        ConversationOut(
            id=c.id, title=c.title, created_at=c.created_at, last_msg_at=c.last_msg_at
        )
        for c in items
    ]


@router.post(
    "/conversations",
    response_model=ConversationOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    body: ConversationCreate,
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> ConversationOut:
    title = body.title or "New conversation"
    conv = await repos.create_conversation(
        session, user_id=claims.user_id, title=title
    )
    await session.commit()
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        last_msg_at=conv.last_msg_at,
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(
    conversation_id: uuid.UUID,
    body: ConversationRename,
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> ConversationOut:
    conv = await repos.rename_conversation(
        session,
        conversation_id=conversation_id,
        user_id=claims.user_id,
        title=body.title,
    )
    if conv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "conversation not found")
    await session.commit()
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        last_msg_at=conv.last_msg_at,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
)
async def list_messages(
    conversation_id: uuid.UUID,
    before: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> list[MessageOut]:
    conv = await repos.get_conversation(
        session, conversation_id=conversation_id, user_id=claims.user_id
    )
    if conv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "conversation not found")
    msgs = await repos.list_messages(
        session, conversation_id=conversation_id, limit=limit, before=before
    )
    return [
        MessageOut(
            id=m.id,
            role=m.role,  # type: ignore[arg-type]
            source=m.source,  # type: ignore[arg-type]
            content=m.content,
            risk_level=m.risk_level,  # type: ignore[arg-type]
            created_at=m.created_at,
        )
        for m in msgs
    ]
