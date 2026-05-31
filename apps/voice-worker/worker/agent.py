"""The Companion's voice incarnation. Shares brain with text chat via imports
from apps.api. This is a stub for commit 1 — replaced in commit 3."""
from __future__ import annotations
import logging

from livekit.agents import JobContext

logger = logging.getLogger(__name__)


async def entrypoint(ctx: JobContext) -> None:
    """LiveKit job entry. Real implementation lands in commit 3."""
    logger.info("voice_job_received room=%s (stub)", ctx.room.name)
    await ctx.connect()
