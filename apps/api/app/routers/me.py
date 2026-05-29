from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims
from app.db import repos
from app.db.models import User
from app.deps import CurrentUser, DBSession
from app.schemas.chat import MeOut
from app.settings import get_settings

router = APIRouter()


@router.get("/me", response_model=MeOut)
async def me(
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> MeOut:
    settings = get_settings()
    user = (
        await session.execute(select(User).where(User.id == claims.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    today = datetime.now(tz=timezone.utc).date()
    usage = await repos.get_or_create_usage_today(
        session, user_id=user.id, today=today
    )
    await session.commit()

    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        today_text_msg_count=usage.text_msg_count,
        daily_text_msg_cap=settings.daily_text_msg_cap,
    )
