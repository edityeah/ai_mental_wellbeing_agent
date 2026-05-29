from __future__ import annotations

import asyncio
import json
import logging
from typing import Literal, TypedDict

from app.agents.anthropic_client import get_client
from app.agents.prompts.loader import load
from app.schemas.chat import SafetyResult
from app.settings import get_settings

logger = logging.getLogger(__name__)


class HistoryTurn(TypedDict):
    role: Literal["user", "assistant"]
    content: str


_TIMEOUT_SECONDS = 2.0


def _build_user_text(message: str, history: list[HistoryTurn]) -> str:
    last_three = history[-3:]
    transcript = "\n".join(f"{h['role']}: {h['content']}" for h in last_three)
    return (
        f"Prior turns (oldest first):\n{transcript}\n\n"
        f"Latest user message:\n{message}"
    )


async def classify(message: str, *, history: list[HistoryTurn]) -> SafetyResult:
    settings = get_settings()
    system = load("safety_classifier")
    user_text = _build_user_text(message, history)

    try:
        client = get_client()
        response = await asyncio.wait_for(
            client.messages.create(
                model=settings.anthropic_haiku_model,
                max_tokens=80,  # output is ~30-50 tokens; tight budget cuts latency
                system=system,
                messages=[{"role": "user", "content": user_text}],
            ),
            timeout=_TIMEOUT_SECONDS,
        )
        text = response.content[0].text  # type: ignore[union-attr]
    except (TimeoutError, asyncio.TimeoutError) as e:
        logger.warning("safety_classifier_timeout", exc_info=e)
        return SafetyResult(risk="elevated", reason="classifier timeout (fallback)")
    except Exception as e:
        logger.warning("safety_classifier_error", exc_info=e)
        return SafetyResult(risk="elevated", reason="classifier error (fallback)")

    try:
        parsed = json.loads(_strip_code_fences(text))
        return SafetyResult.model_validate(parsed)
    except Exception as e:
        logger.warning("safety_classifier_parse_failed text=%r exc=%s", text, e)
        return SafetyResult(risk="elevated", reason="classifier parse failed (fallback)")


def _strip_code_fences(text: str) -> str:
    """Claude often wraps JSON in ```json ... ``` fences despite being told not to."""
    t = text.strip()
    if t.startswith("```"):
        # Drop first line (``` or ```json) and trailing ```
        lines = t.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return t
