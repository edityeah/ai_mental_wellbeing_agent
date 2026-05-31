from __future__ import annotations
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    """Voice-worker config. Reads from apps/api/.env so we share the same
    LiveKit, Anthropic, Deepgram, Cartesia, and database creds as the API."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent.parent.parent / "api" / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LiveKit
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = ""

    # STT / TTS
    deepgram_api_key: str = ""
    cartesia_api_key: str = ""
    cartesia_voice_id: str = "5345cf08-6f37-424d-a5d9-8ae1101b9377"  # warm female Indian-English (a Cartesia default — Aditya can swap later)

    # LLM
    anthropic_api_key: str = ""
    anthropic_companion_model: str = "claude-sonnet-4-6"
    anthropic_haiku_model: str = "claude-haiku-4-5-20251001"

    # API + DB
    database_url: str = ""
    api_base_url: str = "http://localhost:8000"
    voice_worker_secret: str = ""

    # Worker behavior
    per_call_max_seconds: int = 300       # 5 min
    silence_timeout_seconds: int = 30
    heartbeat_interval_seconds: int = 10


def get_settings() -> WorkerSettings:
    return WorkerSettings()  # type: ignore[call-arg]
