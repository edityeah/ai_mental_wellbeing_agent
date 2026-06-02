from __future__ import annotations

import logging

from app.agents.anthropic_client import get_client
from app.agents.prompts.loader import load
from app.settings import get_settings

logger = logging.getLogger(__name__)


async def generate_title(conversation_excerpt: str) -> str:
    """Generate a 3-6 word title from a multi-turn excerpt of the
    conversation. Pass the first ~6 messages joined as labeled lines —
    a single "Hello?" rarely contains enough signal to title from.
    Returns the literal sentinel "New conversation" on any failure so
    callers can detect a failed attempt and retry later."""
    settings = get_settings()
    system = load("title_generator")
    try:
        client = get_client()
        response = await client.messages.create(
            model=settings.anthropic_haiku_model,
            max_tokens=30,
            system=system,
            messages=[{"role": "user", "content": conversation_excerpt}],
        )
        raw = response.content[0].text  # type: ignore[union-attr]
    except Exception as e:
        logger.warning("title_generator_error", exc_info=e)
        return "New conversation"

    cleaned = raw.strip().strip("\"'").rstrip(".!?")
    # The model sometimes returns the literal default when it can't
    # extract a topic — treat that as a non-title so the caller knows
    # to try again later when there's more context.
    if not cleaned or len(cleaned) > 80 or cleaned.lower() == "new conversation":
        return "New conversation"
    return cleaned
