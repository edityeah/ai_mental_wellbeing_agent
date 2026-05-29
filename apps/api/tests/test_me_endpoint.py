from __future__ import annotations

import uuid

import httpx
import pytest
import respx
from httpx import ASGITransport

from app.main import app
from tests.fixtures.jwt import jwks_payload, make_token

JWKS_URL = "https://test.supabase.co/auth/v1/.well-known/jwks.json"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWKS_URL", JWKS_URL)
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setenv("ANTHROPIC_COMPANION_MODEL", "claude-sonnet-4-6")
    monkeypatch.setenv("ANTHROPIC_HAIKU_MODEL", "claude-haiku-4-5-20251001")
    from app import auth, settings as settings_mod
    settings_mod.get_settings.cache_clear()
    auth._jwks_cache.clear()
    yield
    settings_mod.get_settings.cache_clear()
    auth._jwks_cache.clear()


@pytest.mark.asyncio
@respx.mock
async def test_me_returns_401_without_token():
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/v1/me")
    assert r.status_code == 401


@pytest.mark.asyncio
@respx.mock
async def test_me_returns_user_info_with_valid_token(db_session, test_user):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    token = make_token(user_id=test_user.id, email=test_user.email)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(
            "/api/v1/me", headers={"Authorization": f"Bearer {token}"}
        )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(test_user.id)
    assert body["email"] == test_user.email
    assert body["daily_text_msg_cap"] == 50
    assert body["today_text_msg_count"] == 0
