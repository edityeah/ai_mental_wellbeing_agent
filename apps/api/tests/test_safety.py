from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents import safety
from app.schemas.chat import SafetyResult


def _mock_client_returning(text: str) -> MagicMock:
    client = MagicMock()
    fake_message = MagicMock()
    fake_message.content = [MagicMock(text=text)]
    client.messages.create = AsyncMock(return_value=fake_message)
    return client


@pytest.mark.asyncio
async def test_classifier_parses_none(monkeypatch):
    monkeypatch.setattr(
        safety, "get_client",
        lambda: _mock_client_returning('{"risk":"none","reason":"vent"}'),
    )
    r = await safety.classify("I'm tired today", history=[])
    assert isinstance(r, SafetyResult)
    assert r.risk == "none"


@pytest.mark.asyncio
async def test_classifier_parses_acute(monkeypatch):
    monkeypatch.setattr(
        safety, "get_client",
        lambda: _mock_client_returning(
            '{"risk":"acute","reason":"explicit plan"}'
        ),
    )
    r = await safety.classify("...", history=[])
    assert r.risk == "acute"


@pytest.mark.asyncio
async def test_classifier_falls_back_to_elevated_on_bad_json(monkeypatch):
    monkeypatch.setattr(
        safety, "get_client",
        lambda: _mock_client_returning("not json at all"),
    )
    r = await safety.classify("...", history=[])
    assert r.risk == "elevated"
    assert "fallback" in r.reason.lower()


@pytest.mark.asyncio
async def test_classifier_falls_back_to_elevated_on_timeout(monkeypatch):
    client = MagicMock()
    client.messages.create = AsyncMock(side_effect=TimeoutError("slow"))
    monkeypatch.setattr(safety, "get_client", lambda: client)
    r = await safety.classify("...", history=[])
    assert r.risk == "elevated"
