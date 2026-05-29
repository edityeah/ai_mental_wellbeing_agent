from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents import profile_updater


def _mock_returning(text: str) -> MagicMock:
    client = MagicMock()
    msg = MagicMock()
    msg.content = [MagicMock(text=text)]
    client.messages.create = AsyncMock(return_value=msg)
    return client


@pytest.mark.asyncio
async def test_updates_profile_from_recent_messages(monkeypatch):
    payload = (
        '{"profile":{"stressors":[{"label":"work deadlines","intensity":3}]},'
        '"summary":"User mentioned work pressure."}'
    )
    monkeypatch.setattr(profile_updater, "get_client", lambda: _mock_returning(payload))

    result = await profile_updater.update_profile(
        current_profile={},
        current_summary="",
        recent_messages=[{"role": "user", "content": "work is brutal"}],
    )
    assert result.profile == {"stressors": [{"label": "work deadlines", "intensity": 3}]}
    assert "work pressure" in result.summary


@pytest.mark.asyncio
async def test_returns_none_on_bad_json(monkeypatch):
    monkeypatch.setattr(
        profile_updater, "get_client", lambda: _mock_returning("not json")
    )
    result = await profile_updater.update_profile(
        current_profile={}, current_summary="", recent_messages=[]
    )
    assert result is None


@pytest.mark.asyncio
async def test_returns_none_on_schema_violation(monkeypatch):
    monkeypatch.setattr(
        profile_updater,
        "get_client",
        lambda: _mock_returning(
            '{"profile":{"stressors":[{"label":"x","intensity":99}]},"summary":"s"}'
        ),
    )
    result = await profile_updater.update_profile(
        current_profile={}, current_summary="", recent_messages=[]
    )
    assert result is None
