from __future__ import annotations

import logging

from app.agents.anthropic_client import get_client
from app.agents.prompts.loader import load
from app.settings import get_settings

logger = logging.getLogger(__name__)


async def generate_title(first_user_message: str) -> str:
    settings = get_settings()
    system = load("title_generator")
    try:
        client = get_client()
        response = await client.messages.create(
            model=settings.anthropic_haiku_model,
            max_tokens=30,
            system=system,
            messages=[{"role": "user", "content": first_user_message}],
        )
        raw = response.content[0].text  # type: ignore[union-attr]
    except Exception as e:
        logger.warning("title_generator_error", exc_info=e)
        return "New conversation"

    cleaned = raw.strip().strip("\"'").rstrip(".!?")
    if not cleaned or len(cleaned) > 80:
        return "New conversation"
    return cleaned
