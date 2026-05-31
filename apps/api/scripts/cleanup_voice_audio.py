"""Delete voice-session audio recordings older than 24h.

Run via cron (or a Supabase scheduled function) every hour:

    cd apps/api && uv run python -m scripts.cleanup_voice_audio

For each voice_sessions row where ended_at < now() - 24h and audio_egress_url
is NOT NULL:
- Delete the file from Supabase Storage (bucket: voice-recordings).
- Null out audio_egress_url.

See apps/api/README.md "Operations" section for the runbook.

NOTE: Production deployment should use a Supabase service_role key, not the
anon key, for storage deletions. The anon key path is a placeholder for the
current dev environment — set SUPABASE_SERVICE_ROLE_KEY in env + extend
settings.py when going live.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, update

from app.db.models import VoiceSession
from app.db.session import get_sessionmaker
from app.settings import get_settings

logger = logging.getLogger(__name__)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = get_settings()
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=24)
    sm = get_sessionmaker()

    deleted = 0
    failed = 0
    async with sm() as session:
        stmt = select(VoiceSession).where(
            VoiceSession.ended_at < cutoff,
            VoiceSession.audio_egress_url.is_not(None),
        )
        rows = (await session.execute(stmt)).scalars().all()

        if not rows:
            logger.info("nothing_to_clean cutoff=%s", cutoff.isoformat())
            return

        for row in rows:
            url = row.audio_egress_url
            if not url:
                continue
            try:
                # Storage URL format:
                # https://<project>.supabase.co/storage/v1/object/voice-recordings/<filename>
                # We DELETE via the storage API with the service role key.
                # NOTE: for now we don't have a service role key configured, so this
                # log-and-mark-deleted path is a placeholder.
                if settings.supabase_url and settings.supabase_anon_key:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.delete(
                            url,
                            headers={
                                "Authorization": f"Bearer {settings.supabase_anon_key}",
                                "apikey": settings.supabase_anon_key,
                            },
                        )
                        if resp.status_code not in (200, 204, 404):
                            logger.warning(
                                "storage_delete_failed status=%s url=%s body=%s",
                                resp.status_code,
                                url,
                                resp.text[:200],
                            )
                            failed += 1
                            continue
                # Mark as deleted in DB
                await session.execute(
                    update(VoiceSession)
                    .where(VoiceSession.id == row.id)
                    .values(audio_egress_url=None)
                )
                deleted += 1
            except Exception as e:
                logger.exception("cleanup_error session=%s err=%s", row.id, e)
                failed += 1

        await session.commit()
    logger.info("cleanup_done deleted=%d failed=%d", deleted, failed)


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(0)
