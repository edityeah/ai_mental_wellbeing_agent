from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import repos


class RateLimitExceeded(Exception):
    """Raised when the user's daily text message quota is exhausted."""


async def consume_text_message_quota(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    today: date,
    cap: int,
) -> int:
    """Atomically check and increment the per-user-per-day text message counter.

    Returns the post-increment count. Raises RateLimitExceeded if the cap is
    already reached BEFORE this call (so the increment does not happen).
    """
    usage = await repos.get_or_create_usage_today(
        session, user_id=user_id, today=today
    )
    if usage.text_msg_count >= cap:
        raise RateLimitExceeded(f"daily cap of {cap} reached")
    usage.text_msg_count += 1
    await session.flush()
    return usage.text_msg_count
