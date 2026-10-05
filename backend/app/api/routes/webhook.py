import logging
from uuid import UUID
from fastapi import APIRouter, BackgroundTasks, Depends, Header, Response, status
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.repositories.calendar_repository import get_calendar_by_id
from app.repositories.calendar_sync_repository import get_sync_by_channel_id
from app.services.meeting_sync_service import sync_calendar_meetings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/webhooks",
    tags=["Webhooks"],
)

def _process_calendar_notification(
    calendar_id: UUID,
    user_id: UUID,
):
    """
    Background worker function to perform incremental sync in a fresh DB session.
    """
    db = SessionLocal()
    try:
        calendar = get_calendar_by_id(
            db=db,
            calendar_id=calendar_id,
            user_id=user_id,
        )
        if not calendar:
            logger.warning(
                f"Background sync skipped: calendar {calendar_id} not found."
            )
            return

        synced_count = sync_calendar_meetings(
            db=db,
            user_id=user_id,
            calendar=calendar,
        )
        logger.info(
            f"Webhook sync completed for calendar {calendar_id}: {synced_count} meetings updated."
        )
    except Exception as exc:
        logger.error(
            f"Background sync failed for calendar {calendar_id}: {exc}",
            exc_info=True,
        )
    finally:
        db.close()


@router.post("/google-calendar")
def handle_google_calendar_webhook(
    background_tasks: BackgroundTasks,
    x_goog_channel_id: str = Header(..., alias="X-Goog-Channel-ID"),
    x_goog_resource_id: str | None = Header(None, alias="X-Goog-Resource-ID"),
    x_goog_resource_state: str = Header(..., alias="X-Goog-Resource-State"),
    x_goog_message_number: str | None = Header(None, alias="X-Goog-Message-Number"),
    x_goog_channel_token: str | None = Header(None, alias="X-Goog-Channel-Token"),
    x_goog_channel_expiration: str | None = Header(None, alias="X-Goog-Channel-Expiration"),
    db: Session = Depends(get_db),
):
    """
    Webhook receiver endpoint for Google Calendar push notifications.
    Google delivers notifications with metadata in HTTP headers.
    """
    logger.info(
        f"Received Google Calendar webhook: channel_id={x_goog_channel_id}, state={x_goog_resource_state}, msg_num={x_goog_message_number}"
    )

    # 1. State 'sync': Initial verification handshake sent when watch() is called
    if x_goog_resource_state == "sync":
        logger.info(
            f"Handshake 'sync' state verified for channel {x_goog_channel_id}"
        )
        return Response(
            content="Sync handshake received",
            status_code=status.HTTP_200_OK,
        )

    # 2. Lookup the calendar subscription in database
    sync_state = get_sync_by_channel_id(
        db=db,
        channel_id=x_goog_channel_id,
    )

    if not sync_state or not sync_state.calendar:
        logger.warning(
            f"Received webhook for unknown or expired channel {x_goog_channel_id}. Acknowledging with 200."
        )
        return Response(
            content="Channel not found",
            status_code=status.HTTP_200_OK,
        )

    # Validate resource_id if provided
    if x_goog_resource_id and sync_state.resource_id and sync_state.resource_id != x_goog_resource_id:
        logger.warning(
            f"Resource ID mismatch for channel {x_goog_channel_id}: expected {sync_state.resource_id}, got {x_goog_resource_id}"
        )
        return Response(
            content="Resource ID mismatch",
            status_code=status.HTTP_200_OK,
        )

    # 3. State 'exists': Changes detected on the calendar (created, updated, deleted)
    if x_goog_resource_state == "exists":
        calendar_id = sync_state.calendar_id
        user_id = sync_state.calendar.user_id

        # Dispatch background sync so Google gets a fast 200 response
        background_tasks.add_task(
            _process_calendar_notification,
            calendar_id=calendar_id,
            user_id=user_id,
        )

        return Response(
            content="Sync queued",
            status_code=status.HTTP_200_OK,
        )

    return Response(
        content="Ignored state",
        status_code=status.HTTP_200_OK,
    )
