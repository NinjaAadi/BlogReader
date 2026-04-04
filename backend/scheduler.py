import os
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler(timezone="UTC")


def _job_listener(event):
    if event.exception:
        logger.error(f"Scheduled job '{event.job_id}' raised: {event.exception}")
    else:
        logger.debug(f"Scheduled job '{event.job_id}' completed OK.")


def _cleanup_job():
    """Wrapper so db import happens at runtime, not at module load."""
    from db import cleanup_old_articles
    retain_days = int(os.getenv("RETAIN_DAYS", "90"))
    result = cleanup_old_articles(retain_days=retain_days, keep_unread=True)
    logger.info(
        f"[Cleanup] Deleted {result['deleted']} articles "
        f"({result['size_before_mb']} MB → {result['size_after_mb']} MB)"
    )


def _digest_job():
    """Send daily Telegram digest of top unread articles."""
    from db import get_top_unread
    from notifier import send_daily_digest
    articles = get_top_unread(limit=10)
    ok, msg = send_daily_digest(articles)
    if ok:
        logger.info(f"[Digest] {msg}")
    else:
        logger.warning(f"[Digest] Failed: {msg}")


def start_scheduler(fetch_func, interval_minutes: int = None):
    # ── Fetch job: every 1 hour by default ────────────────
    interval = interval_minutes or int(os.getenv("POLL_INTERVAL_MINUTES", "60"))

    _scheduler.add_listener(_job_listener, EVENT_JOB_ERROR | EVENT_JOB_EXECUTED)

    _scheduler.add_job(
        fetch_func,
        trigger=IntervalTrigger(minutes=interval),
        id="fetch_all_sources",
        name="Fetch all blog sources",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # ── Cleanup job: every day at 03:00 UTC ───────────────
    _scheduler.add_job(
        _cleanup_job,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="db_cleanup",
        name="DB cleanup — delete old articles",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # ── Digest job: configurable hour (default 08:00 UTC) ─
    digest_hour = int(os.getenv("DIGEST_HOUR", "8"))
    _scheduler.add_job(
        _digest_job,
        trigger=CronTrigger(hour=digest_hour, minute=0, timezone="UTC"),
        id="daily_digest",
        name="Daily Telegram digest",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    _scheduler.start()
    logger.info(
        f"Scheduler started — fetch every {interval} min, "
        f"cleanup daily at 03:00 UTC, digest daily at {digest_hour:02d}:00 UTC."
    )


def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped.")


def get_scheduler_jobs() -> list:
    """Return info about all scheduled jobs."""
    jobs = []
    for job in _scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": str(job.next_run_time) if job.next_run_time else None,
            "trigger": str(job.trigger),
        })
    return jobs
