from __future__ import annotations

import json
import uuid

import pytest
import respx
import httpx

from app.auth import AuthError, verify_token
from tests.fixtures.jwt import jwks_payload, make_token


JWKS_URL = "https://test.supabase.co/auth/v1/.well-known/jwks.json"


@pytest.fixture(autouse=True)
def _set_jwks_url(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWKS_URL", JWKS_URL)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setenv("ANTHROPIC_COMPANION_MODEL", "claude-sonnet-4-6")
    monkeypatch.setenv("ANTHROPIC_HAIKU_MODEL", "claude-haiku-4-5-20251001")
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    # bust cached settings + jwks
    from app import auth, settings as settings_mod
    settings_mod.get_settings.cache_clear()
    auth._jwks_cache.clear()


@pytest.mark.asyncio
@respx.mock
async def test_verify_valid_token_returns_user_id():
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    uid = uuid.uuid4()
    token = make_token(user_id=uid)

    claims = await verify_token(token)
    assert claims.user_id == uid
    assert claims.email == "test@example.com"


@pytest.mark.asyncio
@respx.mock
async def test_verify_expired_token_raises():
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    token = make_token(expires_in=-10)
    with pytest.raises(AuthError):
        await verify_token(token)


@pytest.mark.asyncio
@respx.mock
async def test_verify_wrong_audience_raises():
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    token = make_token(audience="wrong-aud")
    with pytest.raises(AuthError):
        await verify_token(token)
