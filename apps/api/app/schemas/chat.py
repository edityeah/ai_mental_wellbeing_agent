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


class SafetyResult(BaseModel):
    risk: Literal["none", "elevated", "acute"]
    reason: str


class ProfileUpdaterOutput(BaseModel):
    profile: dict
    summary: str
