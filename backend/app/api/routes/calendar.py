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