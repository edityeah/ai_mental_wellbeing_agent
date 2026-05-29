from __future__ import annotations

from functools import lru_cache

from anthropic import AsyncAnthropic

from app.settings import get_settings


@lru_cache(maxsize=1)
def get_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=get_settings().anthropic_api_key)
