"""Mood check-in endpoints.

Designed for the daily widget shown when a user opens the app on a new
day. One reading per day max — re-posting overwrites.

GET  /mood/today        → today's reading or null
GET  /mood/recent       → last 14 days (for a future longitudinal chart)
POST /mood              → upsert today's reading
"""
from __future__ import annotations

from datetime import date as _date, datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims
from app.db.models import MoodCheckin
from app.deps import CurrentUser, DBSession

router = APIRouter()


class MoodIn(BaseModel):
    score: int = Field(ge=1, le=5)
    note: str | None = Field(default=None, max_length=280)


class MoodOut(BaseModel):
    date: _date
    score: int
    note: str | None
    created_at: datetime


@router.get("/mood/today", response_model=MoodOut | None)
async def get_today(
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> MoodOut | None:
    today = datetime.now(tz=timezone.utc).date()
    row = (
        await session.execute(
            select(MoodCheckin).where(
                MoodCheckin.user_id == claims.user_id,
                MoodCheckin.date == today,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    return MoodOut(
        date=row.date,
        score=row.score,
        note=row.note,
        created_at=row.created_at,
    )


@router.get("/mood/recent", response_model=list[MoodOut])
async def get_recent(
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> list[MoodOut]:
    cutoff = datetime.now(tz=timezone.utc).date() - timedelta(days=14)
    rows = (
        await session.execute(
            select(MoodCheckin)
            .where(
                MoodCheckin.user_id == claims.user_id,
                MoodCheckin.date >= cutoff,
            )
            .order_by(MoodCheckin.date.asc())
        )
    ).scalars().all()
    return [
        MoodOut(
            date=r.date, score=r.score, note=r.note, created_at=r.created_at
        )
        for r in rows
    ]


@router.post("/mood", response_model=MoodOut)
async def upsert_today(
    body: MoodIn,
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
) -> MoodOut:
    today = datetime.now(tz=timezone.utc).date()
    stmt = (
        pg_insert(MoodCheckin)
        .values(
            user_id=claims.user_id,
            date=today,
            score=body.score,
            note=(body.note or "").strip()[:280] or None,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "date"],
            set_={
                "score": body.score,
                "note": (body.note or "").strip()[:280] or None,
            },
        )
        .returning(MoodCheckin)
    )
    res = (await session.execute(stmt)).scalar_one()
    await session.commit()
    return MoodOut(
        date=res.date,
        score=res.score,
        note=res.note,
        created_at=res.created_at,
    )
