from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
