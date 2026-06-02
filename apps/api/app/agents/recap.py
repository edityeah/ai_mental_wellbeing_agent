"""Care Plan / recap composer.

Runs after a meaningful conversation ends. Takes the transcript, asks Haiku
to produce a short structured summary the user can re-read later, and
returns either the recap text or `None` (when there's nothing worth
recapping — short calls, just-checking-in chitchat, etc.).
"""
from __future__ import annotations

import logging

from app.agents.anthropic_client import get_client
from app.agents.prompts.loader import load
from app.settings import get_settings

logger = logging.getLogger(__name__)

NO_RECAP_SENTINEL = "NO_RECAP"


def _format_transcript(messages: list[dict]) -> str:
    lines: list[str] = []
    for m in messages:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            lines.append(f"User: {content}")
        elif role == "assistant":
            lines.append(f"Companion: {content}")
        # Skip system_crisis / system_recap — only the actual back-and-forth.
    return "\n".join(lines)


async def generate_recap(messages: list[dict]) -> str | None:
    """Returns the recap text, or None if there's nothing worth recapping.

    `messages` is a list of {"role", "content"} dicts. Only "user" and
    "assistant" rows are used.
    """
    transcript = _format_transcript(messages)
    if not transcript:
        return None

    settings = get_settings()
    system = load("recap")
    try:
        client = get_client()
        response = await client.messages.create(
            model=settings.anthropic_haiku_model,
            max_tokens=400,
            system=system,
            messages=[{"role": "user", "content": transcript}],
        )
        raw = response.content[0].text  # type: ignore[union-attr]
    except Exception as e:
        logger.warning("recap_generate_error", exc_info=e)
        return None

    text = raw.strip()
    if not text or text.upper() == NO_RECAP_SENTINEL:
        return None
    # Defensive: if the model wrapped it in code fences or quotes, strip.
    if text.startswith("```"):
        text = text.strip("`").strip()
    return text
