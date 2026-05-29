from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import repos
from app.db.models import User


@pytest.mark.asyncio
async def test_create_conversation_for_user(db_session: AsyncSession, test_user: User):
    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    assert conv.user_id == test_user.id
    assert conv.title == "New conversation"


@pytest.mark.asyncio
async def test_list_conversations_orders_by_last_msg_at(
    db_session: AsyncSession, test_user: User
):
    c1 = await repos.create_conversation(db_session, user_id=test_user.id)
    c2 = await repos.create_conversation(db_session, user_id=test_user.id)
    await db_session.commit()

    items = await repos.list_conversations(db_session, user_id=test_user.id)
    ids = [c.id for c in items]
    assert set(ids) == {c1.id, c2.id}


@pytest.mark.asyncio
async def test_get_conversation_rejects_other_user(
    db_session: AsyncSession, test_user: User
):
    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    await db_session.commit()

    other_user_id = uuid.uuid4()
    found = await repos.get_conversation(
        db_session, conversation_id=conv.id, user_id=other_user_id
    )
    assert found is None


@pytest.mark.asyncio
async def test_append_message_updates_last_msg_at(
    db_session: AsyncSession, test_user: User
):
    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    await db_session.commit()
    initial = conv.last_msg_at

    msg = await repos.append_message(
        db_session,
        conversation_id=conv.id,
        role="user",
        content="hello",
        source="text",
        risk_level=None,
        token_count=5,
    )
    await db_session.commit()
    await db_session.refresh(conv)
    assert conv.last_msg_at > initial
    assert msg.content == "hello"
