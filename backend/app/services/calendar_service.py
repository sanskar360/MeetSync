from sqlalchemy.orm import Session

from app.repositories.calendar_repository import (
    create_calendar,
    get_calendar_by_google_id,
)
from app.services.google_calendar_service import get_calendar_service


def sync_user_calendars(
    db: Session,
    user_id,
) -> list:
    """
    Fetch calendars accessible to the user from Google Calendar
    and persist their lightweight metadata in PostgreSQL.
    """

    calendar_service = get_calendar_service(
        db=db,
        user_id=user_id,
    )

    response = calendar_service.calendarList().list().execute()

    calendars = []

    for item in response.get("items", []):
        google_calendar_id = item["id"]
        name = item.get("summary", google_calendar_id)

        calendar = get_calendar_by_google_id(
            db=db,
            user_id=user_id,
            google_calendar_id=google_calendar_id,
        )

        if calendar:
            calendar.name = name
        else:
            calendar = create_calendar(
                db=db,
                user_id=user_id,
                google_calendar_id=google_calendar_id,
                name=name,
            )

        calendars.append(calendar)

    db.commit()

    for calendar in calendars:
        db.refresh(calendar)

    return calendars