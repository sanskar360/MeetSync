import asyncio
import logging
from datetime import datetime, timezone

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.calendar_watch_service import renew_expiring_watches

logger = logging.getLogger(__name__)


def run_watch_renewal_cycle(buffer_hours: int | None = None) -> list[dict]:
    """
    Executes a single check-and-renew cycle for expiring or expired
    Google Calendar push notification channels.
    """
    db = SessionLocal()
    try:
        buffer = (
            buffer_hours
            if buffer_hours is not None
            else settings.GOOGLE_WATCH_RENEWAL_BUFFER_HOURS
        )
        logger.info(
            f"Executing watch renewal cycle (renewal buffer: {buffer} hours)..."
        )
        results = renew_expiring_watches(db=db, buffer_hours=buffer)
        
        renewed_count = sum(1 for r in results if r.get("status") in ("renewed", "recovered"))
        failed_count = sum(1 for r in results if r.get("status") == "failed")
        
        logger.info(
            f"Watch renewal cycle completed: {len(results)} processed, "
            f"{renewed_count} renewed/recovered, {failed_count} failed."
        )
        return results
    except Exception as exc:
        logger.error(f"Error during watch renewal cycle: {exc}", exc_info=True)
        return []
    finally:
        db.close()


async def watch_renewal_scheduler_task():
    """
    Continuous background task that runs once every GOOGLE_WATCH_RENEWAL_INTERVAL_SECONDS
    (default: 3600 seconds / 1 hour).
    """
    interval = settings.GOOGLE_WATCH_RENEWAL_INTERVAL_SECONDS
    logger.info(
        f"Starting background watch renewal scheduler loop (interval: {interval}s)..."
    )
    
    # Run an initial cycle shortly after startup (after brief 5s warm up)
    await asyncio.sleep(5)
    
    while True:
        try:
            # Run the synchronous renewal cycle in a thread pool executor to not block the event loop
            await asyncio.to_thread(run_watch_renewal_cycle)
        except asyncio.CancelledError:
            logger.info("Watch renewal scheduler task received cancellation signal. Stopping.")
            break
        except Exception as exc:
            logger.error(
                f"Unexpected error in watch renewal scheduler loop: {exc}",
                exc_info=True,
            )

        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("Watch renewal scheduler sleep cancelled. Exiting loop.")
            break


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("Starting standalone watch renewal runner...")
    run_watch_renewal_cycle()
