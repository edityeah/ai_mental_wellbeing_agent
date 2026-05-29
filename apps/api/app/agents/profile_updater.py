from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Literal, TypedDict

from app.agents.anthropic_client import get_client
from app.agents.prompts.loader import load
from app.schemas.profile import Profile
from app.settings import get_settings

logger = logging.getLogger(__name__)


class HistoryTurn(TypedDict):
    role: Literal["user", "assistant"]
    content: str


@dataclass(slots=True)
class ProfileUpdate:
    profile: dict
    summary: str


def _build_user_payload(
    *, current_profile: dict, current_summary: str, recent_messages: list[HistoryTurn]
) -> str:
    return json.dumps(
        {
            "current_profile": current_profile,
            "current_summary": current_summary,
            "recent_messages": recent_messages,
        },
        ensure_ascii=False,
    )


async def update_profile(
    *,
    current_profile: dict,
    current_summary: str,
    recent_messages: list[HistoryTurn],
) -> ProfileUpdate | None:
    settings = get_settings()
    system = load("profile_updater")
    user_payload = _build_user_payload(
        current_profile=current_profile,
        current_summary=current_summary,
        recent_messages=recent_messages,
    )

    try:
        client = get_client()
        response = await client.messages.create(
            model=settings.anthropic_haiku_model,
            max_tokens=2000,
            system=system,
            messages=[{"role": "user", "content": user_payload}],
        )
        text = response.content[0].text  # type: ignore[union-attr]
    except Exception as e:
        logger.warning("profile_updater_error", exc_info=e)
        return None

    try:
        parsed = json.loads(text)
        profile_obj = Profile.model_validate(parsed.get("profile") or {})
        summary = str(parsed.get("summary", "")).strip()
    except Exception as e:
        logger.warning("profile_updater_parse_failed text=%r exc=%s", text, e)
        return None

    return ProfileUpdate(
        profile=profile_obj.model_dump(mode="json", exclude_defaults=True),
        summary=summary,
    )
