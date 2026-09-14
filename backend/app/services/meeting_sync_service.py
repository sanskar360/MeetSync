from sqlalchemy.orm import Session

from app.repositories.meeting_repository import (
    create_meeting,
    get_meeting_by_ical_uid,
    update_meeting,
)
from app.repositories.meeting_source_repository import (
    create_meeting_source,
    get_source_by_calendar_event,
    update_meeting_source,
)
from app.services.google_event_parser import parse_google_event
from app.services.raw_event_storage import save_raw_event


def sync_calendar_meetings(
    db: Session,
    user_id,
    calendar,
) -> int:
    """
    Synchronize Google Calendar events into MeetSync.

    Returns the number of processed events.
    """

    from app.services.google_calendar_service import list_calendar_events

    events = list_calendar_events(
        db=db,
        user_id=user_id,
        google_calendar_id=calendar.google_calendar_id,
    )

    processed_count = 0

    for event in events:
        # Deleted events will be handled separately.
        if event.get("status") == "cancelled":
            continue

        parsed = parse_google_event(event)

        # Save the complete Google event payload locally.
        raw_payload_path = save_raw_event(
            google_event_id=parsed["google_event_id"],
            event_data=event,
        )

        # Find the logical MeetSync meeting.
        meeting = None

        if parsed["google_ical_uid"]:
            meeting = get_meeting_by_ical_uid(
                db=db,
                google_ical_uid=parsed["google_ical_uid"],
            )

        if meeting:
            update_meeting(
                meeting=meeting,
                title=parsed["title"],
                start_time=parsed["start_time"],
                end_time=parsed["end_time"],
                meet_url=parsed["meet_url"],
                event_type=parsed["event_type"],
                google_updated_at=parsed["google_updated_at"],
                google_etag=parsed["google_etag"],
                google_sequence=parsed["google_sequence"],
                status=parsed["status"],
                raw_payload_path=raw_payload_path,
            )
        else:
            meeting = create_meeting(
                db=db,
                google_ical_uid=parsed["google_ical_uid"],
                google_event_id=parsed["google_event_id"],
                calendar_id=calendar.id,
                title=parsed["title"],
                start_time=parsed["start_time"],
                end_time=parsed["end_time"],
                meet_url=parsed["meet_url"],
                event_type=parsed["event_type"],
                google_updated_at=parsed["google_updated_at"],
                google_etag=parsed["google_etag"],
                google_sequence=parsed["google_sequence"],
                status=parsed["status"],
                raw_payload_path=raw_payload_path,
            )

        # Find the specific Google Calendar representation.
        source = get_source_by_calendar_event(
            db=db,
            calendar_id=calendar.id,
            google_event_id=parsed["google_event_id"],
        )

        if source:
            update_meeting_source(
                source=source,
                google_etag=parsed["google_etag"],
                google_sequence=parsed["google_sequence"],
                raw_payload_path=raw_payload_path,
            )
        else:
            create_meeting_source(
                db=db,
                meeting_id=meeting.id,
                calendar_id=calendar.id,
                google_event_id=parsed["google_event_id"],
                google_etag=parsed["google_etag"],
                google_sequence=parsed["google_sequence"],
                raw_payload_path=raw_payload_path,
            )

        processed_count += 1

    db.commit()

    return processed_count