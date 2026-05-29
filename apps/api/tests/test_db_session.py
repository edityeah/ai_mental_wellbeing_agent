import pytest

from app.db.session import get_engine, get_sessionmaker


@pytest.mark.asyncio
async def test_engine_connects_to_postgres():
    engine = get_engine()
    async with engine.connect() as conn:
        result = await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        assert result.scalar_one() == 1


def test_sessionmaker_is_singleton():
    a = get_sessionmaker()
    b = get_sessionmaker()
    assert a is b
