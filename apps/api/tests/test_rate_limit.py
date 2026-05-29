from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.services.rate_limit import RateLimitExceeded, consume_text_message_quota


@pytest.mark.asyncio
async def test_consume_under_cap_succeeds(db_session: AsyncSession, test_user: User):
    today = date.today()
    n = await consume_text_message_quota(
        db_session, user_id=test_user.id, today=today, cap=3
    )
    assert n == 1


@pytest.mark.asyncio
async def test_consume_at_cap_raises(db_session: AsyncSession, test_user: User):
    today = date.today()
    await consume_text_message_quota(
        db_session, user_id=test_user.id, today=today, cap=2
    )
    await consume_text_message_quota(
        db_session, user_id=test_user.id, today=today, cap=2
    )
    with pytest.raises(RateLimitExceeded):
        await consume_text_message_quota(
            db_session, user_id=test_user.id, today=today, cap=2
        )
