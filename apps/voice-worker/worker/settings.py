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
        # See apps/api/app/settings.py — empty shell env vars were
        # shadowing real .env values.
        env_ignore_empty=True,
    )

    # LiveKit
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = ""

    # STT / TTS
    deepgram_api_key: str = ""
    cartesia_api_key: str = ""
    cartesia_voice_id: str = "4877b818-c7fe-4c89-b1cf-eadf8e23da72"  # Aditya's picked voice (multilingual: Hindi + English)

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
