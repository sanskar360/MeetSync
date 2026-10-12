import logging
import uuid
from datetime import datetime, timezone

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt_token
from app.repositories.google_credential_repository import (
    get_credential_by_user_id,
)

logger = logging.getLogger(__name__)

GOOGLE_CALENDAR_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
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
    sync_token: str | None = None,
) -> tuple[list[dict], str | None]:
    """
    Fetch events from Google Calendar.
    If sync_token is provided, performs incremental sync and returns only modified/deleted events.
    Handles 410 Gone (expired sync token) by automatically falling back to full sync.
    """
    calendar_service = get_calendar_service(
        db=db,
        user_id=user_id,
    )

    events = []
    page_token = None

    while True:
        try:
            params = {
                "calendarId": google_calendar_id,
                "pageToken": page_token,
                "singleEvents": True,
                "showDeleted": True,
                "maxResults": 2500,
            }
            if sync_token:
                params["syncToken"] = sync_token

            response = (
                calendar_service.events()
                .list(**params)
                .execute()
            )

        except HttpError as exc:
            if exc.resp.status == 410 and sync_token:
                # Sync token expired. Perform a full synchronization.
                logger.warning(
                    f"Sync token expired (410 Gone) for calendar {google_calendar_id}. Performing full sync."
                )
                return list_calendar_events(
                    db=db,
                    user_id=user_id,
                    google_calendar_id=google_calendar_id,
                    sync_token=None,
                )

            raise

        events.extend(response.get("items", []))

        page_token = response.get("nextPageToken")

        # In Google Calendar API v3, nextSyncToken is returned on the final page
        if not page_token:
            return events, response.get("nextSyncToken")


def watch_calendar_events(
    db: Session,
    user_id,
    google_calendar_id: str,
    webhook_url: str,
    channel_id: str | None = None,
    token: str | None = None,
    expiration_ms: int | None = None,
) -> dict:
    """
    Subscribes to Google Calendar push notifications via events().watch().

    Returns a dict containing:
    - channel_id: Unique UUID channel identifier
    - resource_id: Google's opaque identifier for the watched resource
    - expiration: datetime (UTC) when the subscription expires
    - raw_response: Google API response
    """
    calendar_service = get_calendar_service(
        db=db,
        user_id=user_id,
    )

    if not channel_id:
        channel_id = str(uuid.uuid4())

    body = {
        "id": channel_id,
        "type": "web_hook",
        "address": webhook_url,
    }

    if token:
        body["token"] = token

    if expiration_ms:
        body["expiration"] = expiration_ms

    response = (
        calendar_service.events()
        .watch(
            calendarId=google_calendar_id,
            body=body,
        )
        .execute()
    )

    resource_id = response.get("resourceId")
    expiration_val = response.get("expiration")
    expiration_dt = None

    if expiration_val:
        # Expiration is returned as timestamp in milliseconds
        expiration_timestamp = int(expiration_val) / 1000.0
        expiration_dt = datetime.fromtimestamp(
            expiration_timestamp,
            tz=timezone.utc,
        )

    return {
        "channel_id": channel_id,
        "resource_id": resource_id,
        "expiration": expiration_dt,
        "raw_response": response,
    }


def stop_calendar_watch(
    db: Session,
    user_id,
    channel_id: str,
    resource_id: str,
) -> bool:
    """
    Stops watching a calendar channel via channels().stop().
    """
    calendar_service = get_calendar_service(
        db=db,
        user_id=user_id,
    )

    try:
        calendar_service.channels().stop(
            body={
                "id": channel_id,
                "resourceId": resource_id,
            }
        ).execute()
        return True
    except HttpError as exc:
        # Channel might have already expired or been cancelled
        logger.warning(
            f"Failed to stop watch channel {channel_id}: {exc}"
        )
        return False