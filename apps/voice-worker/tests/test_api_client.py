from __future__ import annotations
import pytest
import respx
import httpx

from worker.api_client import VoiceApiClient


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("API_BASE_URL", "http://test-api:8000")
    monkeypatch.setenv("VOICE_WORKER_SECRET", "shh")
    # The worker settings cache is module-level via get_settings (no lru_cache),
    # so each call reads env fresh — nothing else to clear here.


@pytest.mark.asyncio
@respx.mock
async def test_heartbeat_returns_should_end_on_quota_exhausted():
    respx.post(
        "http://test-api:8000/api/v1/voice/sessions/room-abc/heartbeat"
    ).mock(
        return_value=httpx.Response(
            200, json={"should_end": True, "reason": "quota_exhausted"}
        )
    )
    c = VoiceApiClient("room-abc")
    res = await c.heartbeat(120)
    await c.aclose()
    assert res.should_end is True
    assert res.reason == "quota_exhausted"


@pytest.mark.asyncio
@respx.mock
async def test_heartbeat_fails_open_on_api_error():
    respx.post(
        "http://test-api:8000/api/v1/voice/sessions/room-abc/heartbeat"
    ).mock(return_value=httpx.Response(500, text="boom"))
    c = VoiceApiClient("room-abc")
    res = await c.heartbeat(30)
    await c.aclose()
    assert res.should_end is False  # we don't kill the call on transient API errors


@pytest.mark.asyncio
@respx.mock
async def test_end_posts_with_secret_header():
    route = respx.post(
        "http://test-api:8000/api/v1/voice/sessions/room-abc/end"
    ).mock(return_value=httpx.Response(204))
    c = VoiceApiClient("room-abc")
    await c.end(duration_seconds=287, end_reason="user_hangup")
    await c.aclose()
    sent = route.calls[0].request
    assert sent.headers["X-Voice-Worker-Secret"] == "shh"
    body = sent.content.decode()
    assert "user_hangup" in body
