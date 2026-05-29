from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents import title


def _mock_returning(text: str) -> MagicMock:
    client = MagicMock()
    msg = MagicMock()
    msg.content = [MagicMock(text=text)]
    client.messages.create = AsyncMock(return_value=msg)
    return client


@pytest.mark.asyncio
async def test_title_strips_quotes_and_punctuation(monkeypatch):
    monkeypatch.setattr(
        title, "get_client", lambda: _mock_returning('"Work stress and sleep."')
    )
    t = await title.generate_title("Couldn't sleep again last night")
    assert t == "Work stress and sleep"


@pytest.mark.asyncio
async def test_title_falls_back_to_default_on_error(monkeypatch):
    client = MagicMock()
    client.messages.create = AsyncMock(side_effect=RuntimeError("nope"))
    monkeypatch.setattr(title, "get_client", lambda: client)
    t = await title.generate_title("anything")
    assert t == "New conversation"
