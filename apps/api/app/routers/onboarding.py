"""Onboarding endpoint — runs once on first sign-in.

Collects a few low-friction answers from the user and uses them to seed
the progressive profile so the Companion has *something* to work with
from message one, instead of starting cold. Also captures the user's
display name and marks them as onboarded so the web app stops redirecting.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims
from app.db import repos
from app.db.models import User
from app.deps import CurrentUser, DBSession
from app.schemas.chat import OnboardingIn

router = APIRouter()


@router.post("/onboarding", status_code=200)
async def complete_onboarding(
    body: OnboardingIn,
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> dict:
    if not body.accept_terms:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You must accept the terms to continue.",
        )

    user = (
        await session.execute(select(User).where(User.id == claims.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    if body.display_name:
        user.display_name = body.display_name.strip()[:120]

    user.onboarded_at = datetime.now(tz=timezone.utc)

    # Seed the progressive profile so the Companion has context from
    # turn one. These are loose first guesses — the profile_updater will
    # refine them as the user actually talks.
    profile_row = await repos.get_or_create_profile(
        session, user_id=claims.user_id
    )
    current = dict(profile_row.profile or {})

    if body.bringing_you_here and len(body.bringing_you_here.strip()) >= 3:
        stressors = list(current.get("stressors") or [])
        stressors.append(
            {"label": body.bringing_you_here.strip()[:200], "intensity": 3}
        )
        current["stressors"] = stressors

    if body.what_helps and len(body.what_helps.strip()) >= 3:
        coping = list(current.get("coping_strategies") or [])
        coping.append({"label": body.what_helps.strip()[:200]})
        current["coping_strategies"] = coping

    if body.support and len(body.support.strip()) >= 2:
        existing = list(current.get("support_system") or [])
        # Split on commas if the user listed multiple — natural answer
        # to "who can you lean on?"
        for piece in body.support.split(","):
            piece = piece.strip()[:80]
            if piece and piece not in existing:
                existing.append(piece)
        current["support_system"] = existing

    profile_row.profile = current

    # Seed an initial summary line so the Companion's first reply isn't
    # blind. Profile updater will overwrite this once a real conversation
    # happens.
    name = (user.display_name or "").strip()
    seed_summary_parts = []
    if name:
        seed_summary_parts.append(f"User goes by {name}.")
    if body.bringing_you_here:
        seed_summary_parts.append(
            f"In their own words on first sign-in: "
            f"{body.bringing_you_here.strip()[:300]}"
        )
    if seed_summary_parts and not (profile_row.summary or "").strip():
        profile_row.summary = " ".join(seed_summary_parts)

    await session.commit()
    return {"ok": True}
