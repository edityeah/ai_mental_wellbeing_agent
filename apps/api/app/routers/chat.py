from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.auth import AuthClaims
from app.db.session import get_sessionmaker
from app.deps import CurrentUser, DBSession
from app.schemas.chat import ChatRequest
from app.services.chat_service import (
    StreamFooter,
    StreamHeader,
    maybe_generate_title,
    maybe_run_profile_updater,
    run_chat_turn,
)
from app.services.rate_limit import RateLimitExceeded

logger = logging.getLogger(__name__)

router = APIRouter()


async def _sse_events(
    session: AsyncSession,
    *,
    user_id,
    conversation_id,
    content: str,
) -> AsyncIterator[dict]:
    async for event in run_chat_turn(
        session, user_id=user_id, conversation_id=conversation_id, user_text=content
    ):
        if isinstance(event, StreamHeader):
            yield {
                "event": "started",
                "data": json.dumps(
                    {
                        "message_id": str(event.message_id),
                        "risk": event.risk,
                        "kind": event.kind,
                    }
                ),
            }
        elif isinstance(event, StreamFooter):
            yield {
                "event": "done",
                "data": json.dumps({"total_tokens": event.total_tokens}),
            }
        else:
            yield {"event": "token", "data": json.dumps({"text": event})}


@router.post("/chat")
async def chat(
    body: ChatRequest,
    background: BackgroundTasks,
    claims: AuthClaims = CurrentUser,
    session: AsyncSession = DBSession,
):
    # Pre-check rate limit so we can return 429 cleanly (the generator can't).
    # The actual increment also happens inside run_chat_turn for transactional safety.
    try:
        from datetime import datetime, timezone
        from app.settings import get_settings
        cap = get_settings().daily_text_msg_cap
        today = datetime.now(tz=timezone.utc).date()
        from app.db import repos
        usage = await repos.get_or_create_usage_today(
            session, user_id=claims.user_id, today=today
        )
        if usage.text_msg_count >= cap:
            return JSONResponse(
                status_code=429, content={"error": "daily_cap_reached"}
            )
    except Exception as e:
        logger.exception("rate_check_pre_failed: %s", e)

    # Schedule background work to run *after* the response completes.
    async def _post_response():
        sm = get_sessionmaker()
        async with sm() as bg_session:
            try:
                await maybe_generate_title(
                    bg_session,
                    user_id=claims.user_id,
                    conversation_id=body.conversation_id,
                    first_user_text=body.content,
                )
            except Exception as e:
                logger.exception("title_bg_failed: %s", e)
        async with sm() as bg_session:
            try:
                await maybe_run_profile_updater(
                    bg_session,
                    user_id=claims.user_id,
                    conversation_id=body.conversation_id,
                )
            except Exception as e:
                logger.exception("profile_updater_bg_failed: %s", e)

    background.add_task(_post_response)

    async def event_source():
        try:
            async for ev in _sse_events(
                session,
                user_id=claims.user_id,
                conversation_id=body.conversation_id,
                content=body.content,
            ):
                yield ev
        except LookupError:
            yield {"event": "error", "data": json.dumps({"error": "conversation_not_found"})}
        except RateLimitExceeded:
            yield {
                "event": "error",
                "data": json.dumps({"error": "daily_cap_reached"}),
            }
        except Exception as e:
            logger.exception("chat_stream_failed: %s", e)
            yield {
                "event": "error",
                "data": json.dumps({"error": "internal"}),
            }

    return EventSourceResponse(event_source())
