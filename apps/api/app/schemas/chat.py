from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    conversation_id: uuid.UUID
    content: str = Field(..., min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant", "system_crisis"]
    source: Literal["text", "voice"]
    content: str
    risk_level: Literal["none", "elevated", "acute"] | None
    created_at: datetime


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    last_msg_at: datetime


class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    today_text_msg_count: int
    daily_text_msg_cap: int
    voice_seconds_used_today: int
    voice_seconds_cap: int


class SafetyResult(BaseModel):
    risk: Literal["none", "elevated", "acute"]
    reason: str


class ProfileUpdaterOutput(BaseModel):
    profile: dict
    summary: str


class VoiceTokenRequest(BaseModel):
    conversation_id: uuid.UUID


class VoiceTokenResponse(BaseModel):
    access_token: str
    room_name: str
    livekit_url: str
    ttl_seconds: int
    voice_seconds_remaining: int


class VoiceHeartbeatRequest(BaseModel):
    elapsed_seconds: int = Field(..., ge=0, le=600)


class VoiceHeartbeatResponse(BaseModel):
    should_end: bool
    reason: str | None = None


class VoiceEndRequest(BaseModel):
    duration_seconds: int = Field(..., ge=0)
    end_reason: Literal[
        "user_hangup",
        "silence_timeout",
        "max_duration",
        "quota_exhausted",
        "agent_crisis_redirect",
        "error",
    ]
    audio_egress_url: str | None = None
