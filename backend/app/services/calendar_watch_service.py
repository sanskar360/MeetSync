import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.calendar import Calendar
from app.models.calendar_sync import CalendarSync
from app.repositories.calendar_sync_repository import (
    create_calendar_sync,
    get_calendar_sync,
    update_calendar_sync_channel,
    clear_calendar_sync_channel,
    get_calendar_syncs_needing_renewal,
)
from app.services.google_calendar_service import (
    watch_calendar_events,
    stop_calendar_watch,
)

logger = logging.getLogger(__name__)


def register_calendar_watch(
    db: Session,
    user_id,
    calendar: Calendar,
    webhook_url: str | None = None,
) -> CalendarSync:
    """
    Registers a push notification watch channel for a specific calendar.

    Follows safe Create-New -> Persist -> Best-effort Stop-Old ordering:
    1. Create new watch with Google API
    2. Persist new channel_id, resource_id, channel_expiration (leaving sync_token intact!)
    3. Stop previous channel if one existed (non-fatal if old channel already expired)
    """
    target_webhook_url = webhook_url or settings.GOOGLE_WEBHOOK_URL
    if not target_webhook_url:
        raise ValueError(
            "Webhook URL is not configured. Set GOOGLE_WEBHOOK_URL in environment or pass webhook_url."
        )

    sync_state = get_calendar_sync(db=db, calendar_id=calendar.id)
    if not sync_state:
        sync_state = create_calendar_sync(db=db, calendar_id=calendar.id)

    old_channel_id = sync_state.channel_id
    old_resource_id = sync_state.resource_id

    # 1. Create new watch channel with Google
    watch_data = watch_calendar_events(
        db=db,
        user_id=user_id,
        google_calendar_id=calendar.google_calendar_id,
        webhook_url=target_webhook_url,
    )

    # 2. Persist new channel state atomically (sync_token remains completely untouched)
    update_calendar_sync_channel(
        db=db,
        sync=sync_state,
        channel_id=watch_data["channel_id"],
        resource_id=watch_data["resource_id"],
        channel_expiration=watch_data["expiration"],
    )
    db.commit()
    db.refresh(sync_state)

    logger.info(
        f"Watch subscription active for calendar={calendar.id}: "
        f"channel_id={sync_state.channel_id}, expiration={sync_state.channel_expiration}"
    )

    # 3. Clean up previous channel if it existed (best-effort, non-fatal)
    if old_channel_id and old_resource_id and old_channel_id != sync_state.channel_id:
        try:
            stop_calendar_watch(
                db=db,
                user_id=user_id,
                channel_id=old_channel_id,
                resource_id=old_resource_id,
            )
        except Exception as exc:
            logger.warning(
                f"Could not stop old watch channel {old_channel_id} for calendar {calendar.id}: {exc}"
            )

    return sync_state


def stop_calendar_watch_for_calendar(
    db: Session,
    user_id,
    calendar: Calendar,
) -> CalendarSync | None:
    """
    Stops an active push notification watch channel for a calendar and clears DB channel fields.
    """
    sync_state = get_calendar_sync(db=db, calendar_id=calendar.id)
    if not sync_state:
        return None

    if sync_state.channel_id and sync_state.resource_id:
        try:
            stop_calendar_watch(
                db=db,
                user_id=user_id,
                channel_id=sync_state.channel_id,
                resource_id=sync_state.resource_id,
            )
        except Exception as exc:
            logger.warning(
                f"Failed to stop watch channel {sync_state.channel_id} with Google: {exc}"
            )

    clear_calendar_sync_channel(db=db, sync=sync_state)
    db.commit()
    db.refresh(sync_state)

    return sync_state


def renew_expiring_watches(
    db: Session,
    buffer_hours: int | None = None,
) -> list[dict]:
    """
    Finds all active and already-expired watch channels needing renewal
    (channel_expiration <= now + buffer_hours) and renews them.

    Features:
    - Centralized execution with efficient single DB query
    - Row-level locking to prevent concurrent workers from double-renewing
    - Recovers both soon-to-expire AND already-expired channels
    - Does NOT modify or reset sync_token
    - Structured logging for every renewal attempt
    - One failure does not abort processing of remaining calendars
    """
    buffer = (
        buffer_hours
        if buffer_hours is not None
        else settings.GOOGLE_WATCH_RENEWAL_BUFFER_HOURS
    )

    now = datetime.now(timezone.utc)
    threshold = now + timedelta(hours=buffer)

    # Concurrency safe: lock candidate rows with skip_locked
    syncs_needing_renewal = get_calendar_syncs_needing_renewal(
        db=db,
        before_time=threshold,
        for_update=True,
    )

    if not syncs_needing_renewal:
        logger.info(
            f"No watch channels requiring renewal at this time (checked threshold: {threshold.isoformat()})."
        )
        return []

    logger.info(
        f"Found {len(syncs_needing_renewal)} calendar watch channel(s) needing renewal/recovery."
    )

    results = []

    for sync_state in syncs_needing_renewal:
        calendar = sync_state.calendar
        if not calendar:
            logger.warning(
                f"Skipping renewal for orphaned CalendarSync {sync_state.id} (no associated calendar)."
            )
            continue

        old_channel_id = sync_state.channel_id
        old_resource_id = sync_state.resource_id
        old_expiration = sync_state.channel_expiration
        is_already_expired = (
            old_expiration is not None and old_expiration < now
        )

        try:
            # Attempt to register/renew watch
            renewed_sync = register_calendar_watch(
                db=db,
                user_id=calendar.user_id,
                calendar=calendar,
            )

            status_label = "recovered" if is_already_expired else "renewed"

            logger.info(
                f"Watch renewal:\n"
                f"  calendar={calendar.id}\n"
                f"  user={calendar.user_id}\n"
                f"  old_channel={old_channel_id}\n"
                f"  old_expiration={old_expiration.isoformat() if old_expiration else 'None'}\n"
                f"  new_channel={renewed_sync.channel_id}\n"
                f"  new_expiration={renewed_sync.channel_expiration.isoformat() if renewed_sync.channel_expiration else 'None'}\n"
                f"  status={status_label}"
            )

            results.append({
                "calendar_id": str(calendar.id),
                "user_id": str(calendar.user_id),
                "old_channel_id": old_channel_id,
                "old_expiration": old_expiration.isoformat() if old_expiration else None,
                "new_channel_id": renewed_sync.channel_id,
                "new_expiration": renewed_sync.channel_expiration.isoformat() if renewed_sync.channel_expiration else None,
                "status": status_label,
            })

        except Exception as exc:
            db.rollback()
            logger.error(
                f"Watch renewal failed:\n"
                f"  calendar={calendar.id}\n"
                f"  user={calendar.user_id}\n"
                f"  old_channel={old_channel_id}\n"
                f"  old_expiration={old_expiration.isoformat() if old_expiration else 'None'}\n"
                f"  error={exc}",
                exc_info=True,
            )

            results.append({
                "calendar_id": str(calendar.id),
                "user_id": str(calendar.user_id) if calendar else None,
                "old_channel_id": old_channel_id,
                "old_expiration": old_expiration.isoformat() if old_expiration else None,
                "status": "failed",
                "error": str(exc),
            })

    return results
