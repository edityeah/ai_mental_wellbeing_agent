from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthClaims
from app.db import repos
from app.db.models import User
from app.deps import CurrentUser, DBSession
from app.schemas.chat import (
    VoiceEndRequest,
    VoiceHeartbeatRequest,
    VoiceHeartbeatResponse,
    VoiceTokenRequest,
    VoiceTokenResponse,
)
from app.settings import get_settings
from app.voice.livekit_tokens import mint_access_token

logger = logging.getLogger(__name__)
router = APIRouter()


_TOKEN_TTL_SECONDS = 600


async def require_worker_secret(
    x_voice_worker_secret: str | None = Header(default=None),
) -> None:
    expected = get_settings().voice_worker_secret
    if not expected or x_voice_worker_secret != expected:
        raise HTTPException(status_code=401, detail="invalid worker secret")


WorkerSecret = Depends(require_worker_secret)


@router.post("/voice/token")
async def voice_token(
    body: VoiceTokenRequest,
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
):
    settings = get_settings()
    today = datetime.now(tz=timezone.utc).date()

    # Validate conversation ownership.
    conv = await repos.get_conversation(
        session, conversation_id=body.conversation_id, user_id=claims.user_id
    )
    if conv is None:
        raise HTTPException(status_code=404, detail="conversation not found")

    # Per-user daily cap.
    used = await repos.get_voice_seconds_today(
        session, user_id=claims.user_id, today=today
    )
    if used >= settings.daily_voice_seconds_cap:
        return JSONResponse(
            status_code=429, content={"error": "daily_voice_cap_reached"}
        )

    # Global daily cap.
    global_used = await repos.total_voice_seconds_today_global(
        session, today=today
    )
    global_cap_seconds = settings.daily_voice_minutes_global * 60
    if global_used >= global_cap_seconds:
        return JSONResponse(
            status_code=503, content={"error": "global_voice_cap_reached"}
        )

    # Look up user for display name (used as LiveKit participant name).
    user = (
        await session.execute(select(User).where(User.id == claims.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    room_name = f"room-{uuid.uuid4()}"
    voice_seconds_remaining = max(0, settings.daily_voice_seconds_cap - used)

    await repos.create_voice_session(
        session,
        user_id=claims.user_id,
        conversation_id=body.conversation_id,
        room_name=room_name,
    )
    await session.commit()

    access_token = mint_access_token(
        user_id=claims.user_id,
        display_name=user.display_name or claims.email or str(claims.user_id),
        room_name=room_name,
        conversation_id=body.conversation_id,
        voice_seconds_remaining=voice_seconds_remaining,
        ttl_seconds=_TOKEN_TTL_SECONDS,
    )

    return VoiceTokenResponse(
        access_token=access_token,
        room_name=room_name,
        livekit_url=settings.livekit_url,
        ttl_seconds=_TOKEN_TTL_SECONDS,
        voice_seconds_remaining=voice_seconds_remaining,
    )


@router.post(
    "/voice/sessions/{room_name}/heartbeat",
    response_model=VoiceHeartbeatResponse,
    dependencies=[WorkerSecret],
)
async def voice_heartbeat(
    room_name: str,
    body: VoiceHeartbeatRequest,
    session: AsyncSession = DBSession,
) -> VoiceHeartbeatResponse:
    settings = get_settings()
    today = datetime.now(tz=timezone.utc).date()

    vs = await repos.get_voice_session_by_room(session, room_name=room_name)
    if vs is None:
        raise HTTPException(status_code=404, detail="voice session not found")

    # Max-duration check first — does not depend on usage.
    if body.elapsed_seconds >= settings.per_call_max_seconds:
        return VoiceHeartbeatResponse(should_end=True, reason="max_duration")

    last_recorded = vs.duration_seconds or 0
    delta = max(0, body.elapsed_seconds - last_recorded)

    if delta > 0:
        await repos.increment_voice_seconds(
            session,
            user_id=vs.user_id,
            today=today,
            delta_seconds=delta,
        )
        vs.duration_seconds = body.elapsed_seconds
        await session.flush()

    used_now = await repos.get_voice_seconds_today(
        session, user_id=vs.user_id, today=today
    )
    await session.commit()

    if used_now >= settings.daily_voice_seconds_cap:
        return VoiceHeartbeatResponse(should_end=True, reason="quota_exhausted")

    return VoiceHeartbeatResponse(should_end=False, reason=None)


@router.post(
    "/voice/sessions/{room_name}/end",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[WorkerSecret],
)
async def voice_end(
    room_name: str,
    body: VoiceEndRequest,
    session: AsyncSession = DBSession,
) -> Response:
    today = datetime.now(tz=timezone.utc).date()

    vs = await repos.get_voice_session_by_room(session, room_name=room_name)
    if vs is None:
        raise HTTPException(status_code=404, detail="voice session not found")

    last_recorded = vs.duration_seconds or 0
    delta = max(0, body.duration_seconds - last_recorded)
    if delta > 0:
        await repos.increment_voice_seconds(
            session,
            user_id=vs.user_id,
            today=today,
            delta_seconds=delta,
        )

    await repos.end_voice_session(
        session,
        room_name=room_name,
        duration_seconds=body.duration_seconds,
        end_reason=body.end_reason,
        audio_egress_url=body.audio_egress_url,
    )
    await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
