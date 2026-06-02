"""User profile + settings endpoints.

The Companion learns the user's stressors, coping strategies, support
system, sleep patterns, goals, and notable events progressively from
conversation (see app/agents/profile_updater.py). This router lets the
user *see* what we've captured and edit it directly — so they're not
locked out of their own data.

Endpoints:
  GET   /profile   — full profile + summary + display_name
  PATCH /profile   — update any subset of profile fields, summary, or
                     display_name. Pass only the keys you want to change.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims
from app.db import repos
from app.db.models import User
from app.deps import CurrentUser, DBSession
from app.schemas.profile import Profile

router = APIRouter()


class ProfileOut(BaseModel):
    display_name: str | None
    email: str
    profile: dict[str, Any]
    summary: str


class ProfileUpdateIn(BaseModel):
    """All fields optional — send only what you want to change."""

    display_name: str | None = Field(default=None, max_length=120)
    summary: str | None = Field(default=None, max_length=4000)
    profile: dict[str, Any] | None = None


@router.get("/profile", response_model=ProfileOut)
async def get_profile(
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> ProfileOut:
    user = (
        await session.execute(select(User).where(User.id == claims.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    profile_row = await repos.get_or_create_profile(
        session, user_id=claims.user_id
    )
    await session.commit()

    return ProfileOut(
        display_name=user.display_name,
        email=user.email,
        profile=profile_row.profile or {},
        summary=profile_row.summary or "",
    )


@router.patch("/profile", response_model=ProfileOut)
async def patch_profile(
    body: ProfileUpdateIn,
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> ProfileOut:
    user = (
        await session.execute(select(User).where(User.id == claims.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    if body.display_name is not None:
        # Empty string clears the field.
        user.display_name = body.display_name.strip() or None

    profile_row = await repos.get_or_create_profile(
        session, user_id=claims.user_id
    )

    if body.profile is not None:
        # Validate against the Profile schema before storing — protects
        # against client sending malformed shapes (e.g. dropping required
        # `label` field on a Stressor).
        try:
            validated = Profile.model_validate(body.profile).model_dump(
                mode="json", exclude_defaults=False
            )
        except Exception as e:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"invalid profile shape: {e}",
            ) from e
        profile_row.profile = validated

    if body.summary is not None:
        profile_row.summary = body.summary.strip()

    await session.commit()

    return ProfileOut(
        display_name=user.display_name,
        email=user.email,
        profile=profile_row.profile or {},
        summary=profile_row.summary or "",
    )
