from sqlalchemy.orm import Session

from app.models.calendar import Calendar


def get_calendar_by_google_id(
    db: Session,
    user_id,
    google_calendar_id: str,
) -> Calendar | None:
    return (
        db.query(Calendar)
        .filter(
            Calendar.user_id == user_id,
            Calendar.google_calendar_id == google_calendar_id,
        )
        .first()
    )


def create_calendar(
    db: Session,
    user_id,
    google_calendar_id: str,
    name: str,
) -> Calendar:
    calendar = Calendar(
        user_id=user_id,
        google_calendar_id=google_calendar_id,
        name=name,
    )

    db.add(calendar)
    db.flush()

    return calendar

def get_calendar_by_id(
    db: Session,
    calendar_id,
    user_id,
) -> Calendar | None:
    return (
        db.query(Calendar)
        .filter(
            Calendar.id == calendar_id,
            Calendar.user_id == user_id,
        )
        .first()
    )