from __future__ import annotations

from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents import companion


class _FakeStream:
    """Mimics the anthropic stream context manager."""

    def __init__(self, chunks: list[str]):
        self._chunks = chunks

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def text_stream(self) -> AsyncIterator[str]:
        for c in self._chunks:
            yield c

    @property
    def usage(self):
        return MagicMock(input_tokens=10, output_tokens=12)


def _mock_client(chunks: list[str]) -> MagicMock:
    client = MagicMock()
    stream = _FakeStream(chunks)
    client.messages.stream = MagicMock(return_value=stream)
    return client


@pytest.mark.asyncio
async def test_companion_streams_concatenated_text(monkeypatch):
    monkeypatch.setattr(
        companion, "get_client",
        lambda: _mock_client(["That ", "sounds ", "tiring."]),
    )

    chunks: list[str] = []
    async for c in companion.stream_reply(
        history=[{"role": "user", "content": "hi"}],
        risk="none",
        source="text",
        profile={},
        summary="",
    ):
        chunks.append(c)
    assert "".join(chunks) == "That sounds tiring."


@pytest.mark.asyncio
async def test_companion_uses_elevated_addendum_when_risk_elevated(monkeypatch):
    captured: dict = {}

    def factory(*_args, **kwargs):
        captured.update(kwargs)
        return _FakeStream(["ok"])

    client = MagicMock()
    client.messages.stream = factory
    monkeypatch.setattr(companion, "get_client", lambda: client)

    async for _ in companion.stream_reply(
        history=[{"role": "user", "content": "hi"}],
        risk="elevated",
        source="text",
        profile={},
        summary="",
    ):
        pass
    assert "ELEVATED-MODE ADDENDUM" in captured["system"]
