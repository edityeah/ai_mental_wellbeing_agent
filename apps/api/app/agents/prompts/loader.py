from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent


@lru_cache(maxsize=None)
def load(name: str) -> str:
    path = _PROMPTS_DIR / f"{name}.md"
    return path.read_text(encoding="utf-8").strip()
