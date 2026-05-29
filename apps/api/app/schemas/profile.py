from __future__ import annotations

from datetime import date as _date, datetime

from pydantic import BaseModel, Field, ConfigDict


class Stressor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: str
    first_seen: datetime | None = None
    intensity: int | None = Field(default=None, ge=1, le=5)


class CopingStrategy(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: str
    effective: bool | None = None


class SleepPatterns(BaseModel):
    model_config = ConfigDict(extra="ignore")
    typical_hours: float | None = Field(default=None, ge=0, le=24)
    issues: list[str] = Field(default_factory=list)


class Goal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: str
    set_at: datetime | None = None


class NotableEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: str
    date: _date | None = None


class Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stressors: list[Stressor] = Field(default_factory=list)
    coping_strategies: list[CopingStrategy] = Field(default_factory=list)
    support_system: list[str] = Field(default_factory=list)
    sleep_patterns: SleepPatterns | None = None
    goals: list[Goal] = Field(default_factory=list)
    notable_events: list[NotableEvent] = Field(default_factory=list)
