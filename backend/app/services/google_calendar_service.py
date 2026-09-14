from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_token
from app.repositories.google_credential_repository import (
    get_credential_by_user_id,
)


GOOGLE_CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
]


def get_calendar_service(
    db: Session,
    user_id,
):
    credential = get_credential_by_user_id(
        db=db,
        user_id=user_id,
    )

    if not credential:
        raise ValueError(
            "Google credentials not found for this user"
        )

    refresh_token = decrypt_token(
        credential.encrypted_refresh_token
    )

    credentials = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=GOOGLE_CALENDAR_SCOPES,
    )

    credentials.refresh(Request())

    return build(
        "calendar",
        "v3",
        credentials=credentials,
    )

def list_calendar_events(
    db: Session,
    user_id,
    google_calendar_id: str,
) -> list[dict]:
    """
    Fetch events from a Google Calendar.

    This performs the API retrieval only.
    Persistence will be handled by the event sync service.
    """

    calendar_service = get_calendar_service(
        db=db,
        user_id=user_id,
    )

    events = []
    page_token = None

    while True:
        response = (
            calendar_service.events()
            .list(
                calendarId=google_calendar_id,
                pageToken=page_token,
                singleEvents=True,
                showDeleted=True,
                maxResults=2500,
            )
            .execute()
        )

        events.extend(response.get("items", []))

        page_token = response.get("nextPageToken")

        if not page_token:
            break

    return events