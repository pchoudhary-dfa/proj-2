"""
Async poller for system_bg_job_queue when BG_JOB_MQ_TYPE=DB and BG_JOB_POLLER_ENABLED=true.
Runs in the FastAPI process; uses atomic job claiming to eliminate race conditions.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime

from sqlalchemy import func, literal_column

from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import SystemBgJobQueue
from apps.shared.config.config import settings
from apps.shared.services.bg_job_dispatch import claim_and_run_jobs
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)

_last_captcha_cleanup: float = 0.0


def _run_captcha_cleanup() -> None:
    from apps.app_db.services.captcha_service import purge_expired_captcha

    db = SessionLocal()
    try:
        deleted = purge_expired_captcha(db)
        if deleted:
            logger.info("Captcha cleanup: deleted %d expired/used row(s)", deleted)
    finally:
        db.close()


def _reclaim_stale_processing() -> None:
    stale_sec = int(settings.BG_JOB_STALE_LEASE_SEC)
    if stale_sec <= 0:
        return
    now = datetime.utcnow()
    db = SessionLocal()
    try:
        # Compare locked_at to DB time via TIMESTAMPDIFF (MySQL) — same clock as locked_at column.
        stale_expr = func.timestampdiff(
            literal_column("SECOND"),
            SystemBgJobQueue.locked_at,
            func.now(),
        ) > stale_sec
        rows = (
            db.query(SystemBgJobQueue)
            .filter(
                SystemBgJobQueue.job_status == "processing",
                SystemBgJobQueue.locked_at.isnot(None),
                stale_expr,
            )
            .all()
        )
        if not rows:
            return
        for row in rows:
            attempts = (row.attempts or 0) + 1
            row.attempts = attempts
            max_a = row.max_attempts if row.max_attempts is not None else 3
            if attempts >= max_a:
                row.job_status = "failed"
                row.last_error = "stale lease exceeded (worker crash or timeout)"
                row.completed_at = now
            else:
                row.job_status = "pending"
                row.locked_at = None
                row.locked_by = None
        db.commit()
        logger.info("Reclaimed %s stale processing job(s)", len(rows))
    finally:
        db.close()


async def _poll_tick_async() -> None:
    """
    Single polling tick that reclaims stale jobs and processes available jobs atomically.
    
    Uses atomic job claiming to eliminate race conditions between multiple workers.
    """
    # First, reclaim any stale jobs from crashed workers
    if int(settings.BG_JOB_STALE_LEASE_SEC) > 0:
        try:
            await asyncio.to_thread(_reclaim_stale_processing)
        except Exception as e:
            log_background_incident(
                "Background job poller stale reclaim failed",
                error_code="BG_POLLER_RECLAIM_FAILED",
                exc=e,
                source="apps.shared.services.bg_job_poller",
            )
    
    # Use atomic claiming to process jobs without race conditions
    batch = max(1, int(settings.BG_JOB_POLL_BATCH_SIZE))
    try:
        jobs_processed = await asyncio.to_thread(claim_and_run_jobs, batch)
        if jobs_processed > 0:
            logger.debug("Processed %d job(s) in this polling tick", jobs_processed)
    except Exception as e:
        log_background_incident(
            "Background job atomic processing failed",
            error_code="BG_POLLER_PROCESS_FAILED",
            exc=e,
            source="apps.shared.services.bg_job_poller",
        )

    global _last_captcha_cleanup
    from apps.app_db.services.captcha_service import CAPTCHA_CLEANUP_INTERVAL_SEC

    now = time.monotonic()
    if now - _last_captcha_cleanup >= CAPTCHA_CLEANUP_INTERVAL_SEC:
        try:
            await asyncio.to_thread(_run_captcha_cleanup)
            _last_captcha_cleanup = now
        except Exception as e:
            log_background_incident(
                "Captcha cleanup failed",
                error_code="CAPTCHA_CLEANUP_FAILED",
                exc=e,
                source="apps.shared.services.bg_job_poller",
            )


async def bg_job_poller_loop() -> None:
    """
    Main background job polling loop.
    
    Uses atomic job claiming to eliminate race conditions between multiple workers.
    """
    interval = max(1, int(settings.BG_JOB_POLL_INTERVAL_SEC))
    logger.info("Background job poller starting with atomic claiming (race-condition free)")
    
    while True:
        try:
            await _poll_tick_async()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log_background_incident(
                "Background job poller tick failed",
                error_code="BG_POLLER_TICK_FAILED",
                exc=e,
                source="apps.shared.services.bg_job_poller",
            )
        await asyncio.sleep(interval)
