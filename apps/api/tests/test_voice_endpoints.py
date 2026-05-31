from __future__ import annotations

import uuid
from datetime import datetime, timezone

import httpx
import pytest
import respx
from httpx import ASGITransport

from app.db import repos
from app.main import app
from tests.fixtures.jwt import jwks_payload, make_token

JWKS_URL = "https://test.supabase.co/auth/v1/.well-known/jwks.json"
WORKER_SECRET = "test-worker-secret"


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
        "LIVEKIT_API_KEY": "test_key",
        "LIVEKIT_API_SECRET": "test_secret_with_at_least_32_chars_for_hmac",
        "LIVEKIT_URL": "wss://test.livekit.cloud",
        "VOICE_WORKER_SECRET": WORKER_SECRET,
        "DAILY_VOICE_SECONDS_CAP": "600",
        "PER_CALL_MAX_SECONDS": "300",
        "DAILY_VOICE_MINUTES_GLOBAL": "500",
    }.items():
        monkeypatch.setenv(k, v)
    from app import auth, settings as settings_mod

    settings_mod.get_settings.cache_clear()
    auth._jwks_cache.clear()
    yield
    settings_mod.get_settings.cache_clear()
    auth._jwks_cache.clear()


def _client(token: str | None = None, *, worker_secret: str | None = None) -> httpx.AsyncClient:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if worker_secret:
        headers["X-Voice-Worker-Secret"] = worker_secret
    return httpx.AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://t",
        headers=headers,
    )


# ---------------------------------------------------------------------------
# /voice/token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_voice_token_requires_jwt():
    async with _client() as c:
        r = await c.post(
            "/api/v1/voice/token",
            json={"conversation_id": str(uuid.uuid4())},
        )
    assert r.status_code == 401


@pytest.mark.asyncio
@respx.mock
async def test_voice_token_under_cap_succeeds(db_session, test_user):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    await db_session.commit()

    token = make_token(user_id=test_user.id, email=test_user.email)
    async with _client(token) as c:
        r = await c.post(
            "/api/v1/voice/token",
            json={"conversation_id": str(conv.id)},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["room_name"].startswith("room-")
    assert body["livekit_url"] == "wss://test.livekit.cloud"
    assert body["ttl_seconds"] == 600
    assert body["voice_seconds_remaining"] == 600


@pytest.mark.asyncio
@respx.mock
async def test_voice_token_over_cap_returns_429(db_session, test_user):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    today = datetime.now(tz=timezone.utc).date()
    usage = await repos.get_or_create_usage_today(
        db_session, user_id=test_user.id, today=today
    )
    usage.voice_seconds = 600
    await db_session.commit()

    token = make_token(user_id=test_user.id, email=test_user.email)
    async with _client(token) as c:
        r = await c.post(
            "/api/v1/voice/token",
            json={"conversation_id": str(conv.id)},
        )
    assert r.status_code == 429
    assert r.json()["error"] == "daily_voice_cap_reached"


@pytest.mark.asyncio
@respx.mock
async def test_voice_token_rejects_other_users_conv(db_session, test_user):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=jwks_payload()))
    # conv belongs to a *different* user
    from app.db.models import User

    other = User(id=uuid.uuid4(), email=f"o{uuid.uuid4().hex[:8]}@test.local")
    db_session.add(other)
    await db_session.flush()
    conv = await repos.create_conversation(db_session, user_id=other.id)
    await db_session.commit()

    token = make_token(user_id=test_user.id, email=test_user.email)
    async with _client(token) as c:
        r = await c.post(
            "/api/v1/voice/token",
            json={"conversation_id": str(conv.id)},
        )
    assert r.status_code in (403, 404)


# ---------------------------------------------------------------------------
# /voice/sessions/{room}/heartbeat
# ---------------------------------------------------------------------------


async def _seed_voice_session(db_session, test_user) -> str:
    conv = await repos.create_conversation(db_session, user_id=test_user.id)
    room = f"room-{uuid.uuid4()}"
    await repos.create_voice_session(
        db_session,
        user_id=test_user.id,
        conversation_id=conv.id,
        room_name=room,
    )
    await db_session.commit()
    return room


@pytest.mark.asyncio
async def test_voice_heartbeat_requires_worker_secret(db_session, test_user):
    room = await _seed_voice_session(db_session, test_user)
    async with _client() as c:
        r = await c.post(
            f"/api/v1/voice/sessions/{room}/heartbeat",
            json={"elapsed_seconds": 10},
        )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_voice_heartbeat_increments_usage(db_session, test_user):
    room = await _seed_voice_session(db_session, test_user)
    async with _client(worker_secret=WORKER_SECRET) as c:
        r1 = await c.post(
            f"/api/v1/voice/sessions/{room}/heartbeat",
            json={"elapsed_seconds": 30},
        )
        assert r1.status_code == 200, r1.text
        r2 = await c.post(
            f"/api/v1/voice/sessions/{room}/heartbeat",
            json={"elapsed_seconds": 60},
        )
        assert r2.status_code == 200, r2.text

    today = datetime.now(tz=timezone.utc).date()
    # Use a fresh session because we committed inside the request.
    from app.db.session import get_sessionmaker

    sm = get_sessionmaker()
    async with sm() as s:
        used = await repos.get_voice_seconds_today(
            s, user_id=test_user.id, today=today
        )
    assert used == 60


@pytest.mark.asyncio
async def test_voice_heartbeat_signals_quota_exhausted(db_session, test_user):
    room = await _seed_voice_session(db_session, test_user)
    today = datetime.now(tz=timezone.utc).date()
    usage = await repos.get_or_create_usage_today(
        db_session, user_id=test_user.id, today=today
    )
    usage.voice_seconds = 595  # 5 seconds left
    await db_session.commit()

    async with _client(worker_secret=WORKER_SECRET) as c:
        r = await c.post(
            f"/api/v1/voice/sessions/{room}/heartbeat",
            json={"elapsed_seconds": 10},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["should_end"] is True
    assert body["reason"] == "quota_exhausted"


@pytest.mark.asyncio
async def test_voice_heartbeat_signals_max_duration(db_session, test_user):
    room = await _seed_voice_session(db_session, test_user)
    async with _client(worker_secret=WORKER_SECRET) as c:
        r = await c.post(
            f"/api/v1/voice/sessions/{room}/heartbeat",
            json={"elapsed_seconds": 300},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["should_end"] is True
    assert body["reason"] == "max_duration"


# ---------------------------------------------------------------------------
# /voice/sessions/{room}/end
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_voice_end_marks_session_ended(db_session, test_user):
    room = await _seed_voice_session(db_session, test_user)
    async with _client(worker_secret=WORKER_SECRET) as c:
        hb = await c.post(
            f"/api/v1/voice/sessions/{room}/heartbeat",
            json={"elapsed_seconds": 30},
        )
        assert hb.status_code == 200
        end = await c.post(
            f"/api/v1/voice/sessions/{room}/end",
            json={
                "duration_seconds": 45,
                "end_reason": "user_hangup",
                "audio_egress_url": None,
            },
        )
        assert end.status_code == 204

    from app.db.session import get_sessionmaker

    sm = get_sessionmaker()
    async with sm() as s:
        vs = await repos.get_voice_session_by_room(s, room_name=room)
        assert vs is not None
        assert vs.ended_at is not None
        assert vs.end_reason == "user_hangup"
        assert vs.duration_seconds == 45
        today = datetime.now(tz=timezone.utc).date()
        used = await repos.get_voice_seconds_today(
            s, user_id=test_user.id, today=today
        )
    # 30s recorded at heartbeat + 15s delta at end = 45 total
    assert used == 45
