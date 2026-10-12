from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.calendar_repository import get_calendar_by_id
from app.services.calendar_service import sync_user_calendars
from app.services.google_calendar_service import list_calendar_events
from app.services.meeting_sync_service import sync_calendar_meetings


router = APIRouter(
    prefix="/api/calendars",
    tags=["Calendars"],
)


@router.post("/sync")
def sync_calendars(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    try:
        calendars = sync_user_calendars(
            db=db,
            user_id=user_id,
        )

        meeting_count = 0

        for calendar in calendars:
            meeting_count += sync_calendar_meetings(
                db=db,
                user_id=user_id,
                calendar=calendar,
            )

        return {
            "message": "Calendars and meetings synchronized successfully",
            "calendar_count": len(calendars),
            "meeting_count": meeting_count,
            "calendars": [
                {
                    "id": str(calendar.id),
                    "google_calendar_id": calendar.google_calendar_id,
                    "name": calendar.name,
                }
                for calendar in calendars
            ],
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )


@router.get("/events")
def get_calendar_events(
    user_id: UUID,
    google_calendar_id: str,
    db: Session = Depends(get_db),
):
    try:
        events, _ = list_calendar_events(
            db=db,
            user_id=user_id,
            google_calendar_id=google_calendar_id,
        )

        return {
            "count": len(events),
            "events": events,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )


@router.post("/sync/{calendar_id}/meetings")
def sync_meetings(
    calendar_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    calendar = get_calendar_by_id(
        db=db,
        calendar_id=calendar_id,
        user_id=user_id,
    )

    if not calendar:
        raise HTTPException(
            status_code=404,
            detail="Calendar not found",
        )

    try:
        count = sync_calendar_meetings(
            db=db,
            user_id=user_id,
            calendar=calendar,
        )

        return {
            "message": "Meetings synchronized successfully",
            "count": count,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )


@router.post("/watch/{calendar_id}")
def watch_calendar(
    calendar_id: UUID,
    user_id: UUID,
    webhook_url: str | None = None,
    db: Session = Depends(get_db),
):
    from app.services.calendar_watch_service import register_calendar_watch

    calendar = get_calendar_by_id(
        db=db,
        calendar_id=calendar_id,
        user_id=user_id,
    )

    if not calendar:
        raise HTTPException(
            status_code=404,
            detail="Calendar not found",
        )

    try:
        sync_state = register_calendar_watch(
            db=db,
            user_id=user_id,
            calendar=calendar,
            webhook_url=webhook_url,
        )

        return {
            "message": "Calendar watch subscription active",
            "calendar_id": str(calendar_id),
            "channel_id": sync_state.channel_id,
            "resource_id": sync_state.resource_id,
            "channel_expiration": (
                sync_state.channel_expiration.isoformat()
                if sync_state.channel_expiration
                else None
            ),
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to register watch: {exc}",
        )


@router.post("/stop-watch/{calendar_id}")
def stop_calendar_watch_route(
    calendar_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    from app.services.calendar_watch_service import stop_calendar_watch_for_calendar

    calendar = get_calendar_by_id(
        db=db,
        calendar_id=calendar_id,
        user_id=user_id,
    )

    if not calendar:
        raise HTTPException(
            status_code=404,
            detail="Calendar not found",
        )

    try:
        sync_state = stop_calendar_watch_for_calendar(
            db=db,
            user_id=user_id,
            calendar=calendar,
        )

        return {
            "message": "Calendar watch subscription stopped",
            "calendar_id": str(calendar_id),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop watch: {exc}",
        )


@router.get("/status/{calendar_id}")
def get_calendar_sync_status(
    calendar_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    from app.repositories.calendar_sync_repository import get_calendar_sync

    calendar = get_calendar_by_id(
        db=db,
        calendar_id=calendar_id,
        user_id=user_id,
    )

    if not calendar:
        raise HTTPException(
            status_code=404,
            detail="Calendar not found",
        )

    sync_state = get_calendar_sync(db=db, calendar_id=calendar_id)

    if not sync_state:
        return {
            "calendar_id": str(calendar_id),
            "sync_status": "not_started",
            "has_sync_token": False,
            "has_active_watch": False,
        }

    return {
        "calendar_id": str(calendar_id),
        "sync_status": sync_state.sync_status,
        "has_sync_token": sync_state.sync_token is not None,
        "last_synced_at": (
            sync_state.last_synced_at.isoformat()
            if sync_state.last_synced_at
            else None
        ),
        "channel_id": sync_state.channel_id,
        "channel_expiration": (
            sync_state.channel_expiration.isoformat()
            if sync_state.channel_expiration
            else None
        ),
        "has_active_watch": sync_state.channel_id is not None,
        "last_error": sync_state.last_error,
    }