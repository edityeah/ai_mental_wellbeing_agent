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
    for k, v in {
        "SUPABASE_JWKS_URL": JWKS_URL,
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_ANON_KEY": "anon",
        "SUPABASE_JWT_AUDIENCE": "authenticated",
        "ANTHROPIC_API_KEY": "k",
        "ANTHROPIC_COMPANION_MODEL": "claude-sonnet-4-6",
        "ANTHROPIC_HAIKU_MODEL": "claude-haiku-4-5-20251001",
    }.items():
        monkeypatch.setenv(k, v)
    from app import auth, settings as settings_mod
    settings_mod.get_settings.cache_clear()
    auth._jwks_cache.clear()
    yield
    settings_mod.get_settings.cache_clear()
    auth._jwks_cache.clear()


def _client_with_user(test_user) -> tuple[httpx.AsyncClient, str]:
    token = make_token(user_id=test_user.id, email=test_user.email)
    transport = ASGITransport(app=app)
    c = httpx.AsyncClient(
        transport=transport,
        base_url="http://t",
        headers={"Authorization": f"Bearer {token}"},
    )
    return c, token


@pytest.mark.asyncio
@respx.mock
async def test_create_then_list_conversation(test_user):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    c, _ = _client_with_user(test_user)
    async with c:
        r1 = await c.post("/api/v1/conversations", json={})
        assert r1.status_code == 201
        new_id = r1.json()["id"]

        r2 = await c.get("/api/v1/conversations")
        assert r2.status_code == 200
        ids = [conv["id"] for conv in r2.json()]
        assert new_id in ids


@pytest.mark.asyncio
@respx.mock
async def test_rename_conversation(test_user):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    c, _ = _client_with_user(test_user)
    async with c:
        r1 = await c.post("/api/v1/conversations", json={})
        conv_id = r1.json()["id"]
        r2 = await c.patch(
            f"/api/v1/conversations/{conv_id}", json={"title": "Late nights"}
        )
        assert r2.status_code == 200
        assert r2.json()["title"] == "Late nights"


@pytest.mark.asyncio
@respx.mock
async def test_cannot_rename_other_users_conversation(test_user):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    c, _ = _client_with_user(test_user)
    async with c:
        r1 = await c.post("/api/v1/conversations", json={})
        conv_id = r1.json()["id"]

    # Different user, same conversation_id
    other = make_token(user_id=uuid.uuid4(), email="o@t")
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://t",
        headers={"Authorization": f"Bearer {other}"},
    ) as c2:
        r = await c2.patch(
            f"/api/v1/conversations/{conv_id}", json={"title": "Hijacked"}
        )
        assert r.status_code == 404
