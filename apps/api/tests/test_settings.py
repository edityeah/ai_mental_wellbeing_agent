import os

from app.settings import Settings


def test_settings_loads_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setenv("ANTHROPIC_COMPANION_MODEL", "claude-sonnet-4-6")
    monkeypatch.setenv("ANTHROPIC_HAIKU_MODEL", "claude-haiku-4-5-20251001")
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://x.supabase.co/jwks")

    s = Settings()

    assert s.database_url.startswith("postgresql+asyncpg://")
    assert s.anthropic_api_key == "sk-test"
    assert s.daily_text_msg_cap == 50  # default
    assert s.daily_cost_ceiling_usd == 20.0  # default
