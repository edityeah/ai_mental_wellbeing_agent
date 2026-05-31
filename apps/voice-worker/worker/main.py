"""Entry point for the LiveKit voice worker.

Run with:
    cd apps/voice-worker
    uv run python -m worker.main dev      # for local dev, joins all rooms
    uv run python -m worker.main start    # for production
"""
from __future__ import annotations
import logging
import sys

from livekit.agents import WorkerOptions, cli

from worker.agent import entrypoint
from worker.settings import get_settings


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
