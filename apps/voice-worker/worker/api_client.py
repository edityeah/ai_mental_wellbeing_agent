"""Thin client for the worker→API endpoints. Uses VOICE_WORKER_SECRET header."""
from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass

import httpx

from worker.settings import get_settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class HeartbeatResult:
    should_end: bool
    reason: str | None


class VoiceApiClient:
    def __init__(self, room_name: str):
        s = get_settings()
        self._base = s.api_base_url.rstrip("/")
        self._secret = s.voice_worker_secret
        self._room = room_name
        self._client = httpx.AsyncClient(timeout=10.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    @property
    def _headers(self) -> dict[str, str]:
        return {"X-Voice-Worker-Secret": self._secret}

    async def heartbeat(self, elapsed_seconds: int) -> HeartbeatResult:
        url = f"{self._base}/api/v1/voice/sessions/{self._room}/heartbeat"
        try:
            r = await self._client.post(
                url,
                json={"elapsed_seconds": elapsed_seconds},
                headers=self._headers,
            )
            r.raise_for_status()
            payload = r.json()
            return HeartbeatResult(
                should_end=bool(payload.get("should_end")),
                reason=payload.get("reason"),
            )
        except Exception as e:
            logger.warning("heartbeat_failed: %s", e)
            # Fail open — don't kill the call because the API was momentarily down.
            return HeartbeatResult(should_end=False, reason=None)

    async def end(
        self,
        *,
        duration_seconds: int,
        end_reason: str,
        audio_egress_url: str | None = None,
    ) -> None:
        url = f"{self._base}/api/v1/voice/sessions/{self._room}/end"
        try:
            await self._client.post(
                url,
                json={
                    "duration_seconds": duration_seconds,
                    "end_reason": end_reason,
                    "audio_egress_url": audio_egress_url,
                },
                headers=self._headers,
            )
        except Exception as e:
            logger.warning("voice_end_post_failed: %s", e)


async def heartbeat_loop(
    client: VoiceApiClient,
    *,
    get_elapsed_seconds,
    on_should_end,
    interval_seconds: int = 10,
) -> None:
    """Run until cancelled. Polls the API every interval. Calls on_should_end(reason)
    when the API tells us to stop."""
    while True:
        await asyncio.sleep(interval_seconds)
        elapsed = get_elapsed_seconds()
        result = await client.heartbeat(elapsed)
        if result.should_end:
            await on_should_end(result.reason or "quota_exhausted")
            return
