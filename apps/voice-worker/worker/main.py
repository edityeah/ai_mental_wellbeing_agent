"""Entry point for the LiveKit voice worker.

Run with:
    cd apps/voice-worker
    uv run python -m worker.main dev      # for local dev, joins all rooms
    uv run python -m worker.main start    # for production
"""
from __future__ import annotations

# CRITICAL: load apps/api/.env into os.environ BEFORE any `app.*` imports.
# The api's pydantic-settings is CWD-relative; if we don't preload, the
# api modules' get_settings() fails the moment safety.classify runs from
# inside the LLM stream — and the agent silently swallows every user turn.
import os
from pathlib import Path


def _bootstrap_env() -> None:
    env_path = Path(__file__).parent.parent.parent / "api" / ".env"
    if not env_path.exists():
        return
    with env_path.open("r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            # Don't overwrite anything the shell already exported
            if key and key not in os.environ:
                os.environ[key] = val


_bootstrap_env()

# --- Now safe to import the rest ---
import logging  # noqa: E402
import sys  # noqa: E402

from livekit.agents import WorkerOptions, cli  # noqa: E402

from worker.agent import entrypoint  # noqa: E402
from worker.settings import get_settings  # noqa: E402


def _configure_logging() -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        level=logging.INFO,
        stream=sys.stdout,
    )


def main() -> None:
    _configure_logging()
    settings = get_settings()
    if not settings.livekit_url or not settings.livekit_api_key:
        raise SystemExit(
            "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET must be set in apps/api/.env"
        )
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            ws_url=settings.livekit_url,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
        )
    )


if __name__ == "__main__":
    main()
