from __future__ import annotations

import datetime as _dt
import json
import uuid

from livekit import api as livekit_api
from livekit.protocol.agent_dispatch import RoomAgentDispatch
from livekit.protocol.room import RoomConfiguration

from app.settings import get_settings

# Must match the `agent_name` configured in the voice worker's WorkerOptions.
VOICE_AGENT_NAME = "companion"


def mint_access_token(
    *,
    user_id: uuid.UUID,
    display_name: str,
    room_name: str,
    conversation_id: uuid.UUID,
    voice_seconds_remaining: int,
    ttl_seconds: int = 600,
) -> str:
    """Mint a LiveKit room-join access token + agent dispatch directive.

    The token is signed locally using the API key/secret — no LiveKit
    network call is made. Caller is expected to have already validated
    quotas and conversation ownership.

    Includes a RoomConfiguration.agents directive so LiveKit Cloud
    *explicitly* dispatches our named "companion" worker the moment the
    user joins the room. Without this, auto-dispatch is unreliable.
    """
    settings = get_settings()
    if not settings.livekit_api_key or not settings.livekit_api_secret:
        raise RuntimeError("LIVEKIT_API_KEY/SECRET not configured")

    token = (
        livekit_api.AccessToken(
            settings.livekit_api_key,
            settings.livekit_api_secret,
        )
        .with_identity(str(user_id))
        .with_name(display_name or str(user_id))
        .with_metadata(
            json.dumps(
                {
                    "conversation_id": str(conversation_id),
                    "voice_seconds_remaining": voice_seconds_remaining,
                }
            )
        )
        .with_grants(
            livekit_api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .with_room_config(
            RoomConfiguration(
                agents=[
                    RoomAgentDispatch(agent_name=VOICE_AGENT_NAME),
                ],
            )
        )
        .with_ttl(_dt.timedelta(seconds=ttl_seconds))
    )
    return token.to_jwt()
