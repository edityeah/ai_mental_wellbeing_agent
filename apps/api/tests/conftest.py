from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.session import get_engine, get_sessionmaker


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncIterator[AsyncSession]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def test_user(db_session: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email=f"u{uuid.uuid4().hex[:8]}@test.local")
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture(autouse=True, scope="session")
def _ensure_schema():
    """Assume `alembic upgrade head` was run before tests. No-op fixture for now."""
    return None
