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
    *,
    source: str,
    summary: str,
    profile: dict,
    risk: str,
    mood_today: dict | None = None,
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
    # Append today's mood reading if the user did a check-in. Companion
    # uses it to calibrate tone — quieter and slower for 1-2, lighter for
    # 4-5. Kept as a short, factual postscript so the model can ignore it
    # when it doesn't fit.
    if mood_today and mood_today.get("score") is not None:
        score = mood_today["score"]
        note = (mood_today.get("note") or "").strip()
        label = {
            1: "really rough",
            2: "low",
            3: "middling",
            4: "okay",
            5: "good",
        }.get(int(score), "")
        line = (
            f"\n\n---\nMOOD TODAY: The user marked their day as {score}/5"
            f" ({label}) when they came in."
        )
        if note:
            line += f' They added: "{note[:200]}"'
        line += " Calibrate your tone accordingly without naming the score."
        rendered = rendered + line
    return rendered


async def stream_reply(
    *,
    history: list[HistoryTurn],
    risk: Literal["none", "elevated"],
    source: Literal["text", "voice"],
    profile: dict,
    summary: str,
    mood_today: dict | None = None,
) -> AsyncIterator[str]:
    """Yield successive text chunks from the Companion's reply."""
    settings = get_settings()
    system = _build_system_prompt(
        source=source,
        summary=summary,
        profile=profile,
        risk=risk,
        mood_today=mood_today,
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
        async for chunk in stream.text_stream:
            if chunk:
                yield chunk
