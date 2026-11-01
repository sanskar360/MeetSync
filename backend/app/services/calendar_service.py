import logging

from sqlalchemy.orm import Session

from app.repositories.calendar_repository import (
    create_calendar,
    get_calendar_by_google_id,
)
from app.services.google_calendar_service import get_calendar_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Calendar filtering — which Google Calendar IDs are considered "personal"
# ---------------------------------------------------------------------------

# Google's group calendar suffixes that represent non-personal calendars.
# These are stable across accounts — Google uses them for built-in category
# calendars shared with all users.
_NON_PERSONAL_SUFFIXES = (
    "#holiday@group.v.calendar.google.com",   # Holiday calendars
    "#contacts@group.v.calendar.google.com",  # Birthdays / contacts
    "#birthdays@group.v.calendar.google.com", # Birthdays
    "@group.v.calendar.google.com",           # Any other shared group calendar
)

# Display-name keywords that indicate a non-personal calendar
# (matched case-insensitively against the calendar's `summary`)
_NON_PERSONAL_NAME_KEYWORDS = (
    "holiday",
    "holidays",
    "birthday",
    "birthdays",
    "contacts",
)


def is_personal_calendar(item: dict) -> bool:
    """
    Return True only for calendars that belong to the user personally.

    Rules (any one sufficient to EXCLUDE the calendar):
      1. The calendar ID ends with one of the known group-calendar suffixes.
      2. The display name contains a non-personal keyword (e.g. "holiday").

    A calendar is always kept when ``item.get("primary") is True`` even if its
    name happens to contain one of the keywords (edge case but safe).
    """
    if item.get("primary"):
        # The primary calendar is always the user's personal calendar.
        return True

    cal_id = item.get("id", "").lower()
    if any(cal_id.endswith(suffix.lower()) for suffix in _NON_PERSONAL_SUFFIXES):
        return False

    name = item.get("summary", "").lower()
    if any(kw in name for kw in _NON_PERSONAL_NAME_KEYWORDS):
        return False

    return True


def sync_user_calendars(
    db: Session,
    user_id,
) -> list:
    """
    Fetch calendars accessible to the user from Google Calendar,
    filter out non-personal calendars (holidays, birthdays, shared group
    calendars), and persist lightweight metadata in PostgreSQL.

    Returns the list of Calendar ORM objects that were kept.
    """

    calendar_service = get_calendar_service(
        db=db,
        user_id=user_id,
    )

    response = calendar_service.calendarList().list().execute()

    calendars = []
    skipped = []

    for item in response.get("items", []):
        google_calendar_id = item["id"]
        name = item.get("summary", google_calendar_id)

        if not is_personal_calendar(item):
            skipped.append(name)
            logger.info(
                "Skipping non-personal calendar during sync: '%s' (%s)",
                name,
                google_calendar_id,
            )
            continue

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

    if skipped:
        logger.info(
            "Skipped %d non-personal calendar(s): %s",
            len(skipped),
            ", ".join(skipped),
        )

    db.commit()

    for calendar in calendars:
        db.refresh(calendar)

    return calendars
