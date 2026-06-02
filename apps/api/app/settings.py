from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Treat empty env vars as "not set" so a shell that exports e.g.
        # `ANTHROPIC_API_KEY=` (empty) doesn't shadow the real value in
        # .env. This bit us twice — empty env vars were silently making
        # every Anthropic call fail with "Could not resolve authentication
        # method" and the chat would fall back to "Sorry — I had trouble
        # responding right now."
        env_ignore_empty=True,
    )

    database_url: str
    anthropic_api_key: str
    anthropic_companion_model: str
    anthropic_haiku_model: str

    supabase_url: str
    supabase_anon_key: str
    supabase_jwt_audience: str
    supabase_jwks_url: str

    daily_text_msg_cap: int = 50
    daily_cost_ceiling_usd: float = 20.0

    # LiveKit / voice
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = ""
    voice_worker_secret: str = ""
    daily_voice_seconds_cap: int = 600
    per_call_max_seconds: int = 300
    daily_voice_minutes_global: int = 500


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
