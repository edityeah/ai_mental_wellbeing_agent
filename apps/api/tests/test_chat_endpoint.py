from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx
from httpx import ASGITransport

from app.agents import companion, profile_updater, safety, title
from app.db import repos
from app.main import app
from app.schemas.chat import SafetyResult
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


async def _stream_chunks(chunks):
    for c in chunks:
        yield c


def _mock_companion(monkeypatch, chunks: list[str]):
    async def fake_stream_reply(**_):
        for c in chunks:
            yield c
    monkeypatch.setattr(companion, "stream_reply", fake_stream_reply)


def _mock_safety(monkeypatch, risk: str):
    async def fake(message, *, history):
        return SafetyResult(risk=risk, reason="mock")
    monkeypatch.setattr(safety, "classify", fake)


def _mock_title(monkeypatch, value: str = "Work and sleep"):
    async def fake(_):
        return value
    monkeypatch.setattr(title, "generate_title", fake)


@pytest.mark.asyncio
@respx.mock
async def test_chat_happy_path_streams_reply(
    db_session, test_user, monkeypatch
):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    _mock_safety(monkeypatch, "none")
    _mock_companion(monkeypatch, ["That ", "sounds ", "hard."])
    _mock_title(monkeypatch)

    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    await db_session.commit()

    token = make_token(user_id=test_user.id, email=test_user.email)
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://t",
        headers={"Authorization": f"Bearer {token}"},
    ) as c:
        async with c.stream(
            "POST",
            "/api/v1/chat",
            json={"conversation_id": str(conv.id), "content": "hi"},
        ) as r:
            assert r.status_code == 200
            body = ""
            async for line in r.aiter_lines():
                body += line + "\n"

    assert "event: started" in body
    assert "event: token" in body
    assert "event: done" in body
    # Reconstruct the streamed text by extracting all token-event payloads.
    streamed = ""
    for raw_line in body.splitlines():
        if raw_line.startswith("data: "):
            try:
                payload = json.loads(raw_line[len("data: "):])
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict) and "text" in payload:
                streamed += payload["text"]
    assert "That sounds hard." in streamed


@pytest.mark.asyncio
@respx.mock
async def test_chat_acute_path_streams_crisis_card(
    db_session, test_user, monkeypatch
):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    _mock_safety(monkeypatch, "acute")

    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    await db_session.commit()

    token = make_token(user_id=test_user.id, email=test_user.email)
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://t",
        headers={"Authorization": f"Bearer {token}"},
    ) as c:
        async with c.stream(
            "POST",
            "/api/v1/chat",
            json={"conversation_id": str(conv.id), "content": "..."},
        ) as r:
            assert r.status_code == 200
            body = ""
            async for line in r.aiter_lines():
                body += line + "\n"

    assert '"kind": "crisis_card"' in body or '"kind":"crisis_card"' in body
    assert "iCall" in body


@pytest.mark.asyncio
@respx.mock
async def test_chat_rate_limit_hit_returns_429(
    db_session, test_user, monkeypatch
):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    monkeypatch.setenv("DAILY_TEXT_MSG_CAP", "1")
    from app import settings as s_mod
    s_mod.get_settings.cache_clear()

    _mock_safety(monkeypatch, "none")
    _mock_companion(monkeypatch, ["ok"])
    _mock_title(monkeypatch)

    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    await db_session.commit()

    token = make_token(user_id=test_user.id, email=test_user.email)
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://t",
        headers={"Authorization": f"Bearer {token}"},
    ) as c:
        # 1st send: under cap of 1, should succeed
        async with c.stream(
            "POST",
            "/api/v1/chat",
            json={"conversation_id": str(conv.id), "content": "first"},
        ) as r:
            async for _ in r.aiter_lines():
                pass
            assert r.status_code == 200

        # 2nd send: cap exceeded
        r2 = await c.post(
            "/api/v1/chat",
            json={"conversation_id": str(conv.id), "content": "second"},
        )
        assert r2.status_code == 429
        assert r2.json()["error"] == "daily_cap_reached"
