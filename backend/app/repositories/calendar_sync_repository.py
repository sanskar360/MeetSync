from sqlalchemy.orm import Session

from app.models.calendar_sync import CalendarSync


def get_calendar_sync(
    db: Session,
    calendar_id,
) -> CalendarSync | None:
    return (
        db.query(CalendarSync)
        .filter(CalendarSync.calendar_id == calendar_id)
        .first()
    )


def create_calendar_sync(
    db: Session,
    calendar_id,
) -> CalendarSync:
    sync = CalendarSync(
        calendar_id=calendar_id,
        sync_status="pending",
    )

    db.add(sync)
    db.flush()

    return sync