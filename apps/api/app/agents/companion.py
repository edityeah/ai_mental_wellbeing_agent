from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Literal, TypedDict

from app.agents.anthropic_client import get_client
from app.agents.prompts.loader import load
from app.settings import get_settings


class HistoryTurn(TypedDict):
    role: Literal["user", "assistant"]
    content: str


def _build_system_prompt(
    *, source: str, summary: str, profile: dict, risk: str
) -> str:
    base = load("companion_base")
    rendered = (
        base.replace("{source}", source)
        .replace("{summary}", summary or "(none yet)")
        .replace("{profile_json}", json.dumps(profile or {}, ensure_ascii=False))
    )
    if risk == "elevated":
        addendum = load("companion_elevated")
        rendered = f"{rendered}\n\n{addendum}"
    return rendered


async def stream_reply(
    *,
    history: list[HistoryTurn],
    risk: Literal["none", "elevated"],
    source: Literal["text", "voice"],
    profile: dict,
    summary: str,
) -> AsyncIterator[str]:
    """Yield successive text chunks from the Companion's reply."""
    settings = get_settings()
    system = _build_system_prompt(
        source=source, summary=summary, profile=profile, risk=risk
    )
    client = get_client()

    max_tokens = 600 if source == "text" else 220  # voice replies are shorter
    stream_cm = client.messages.stream(
        model=settings.anthropic_companion_model,
        max_tokens=max_tokens,
        system=system,
        messages=history,
    )
    async with stream_cm as stream:
        async for chunk in stream.text_stream():
            if chunk:
                yield chunk
