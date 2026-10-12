from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.repositories.calendar_sync_repository import (
    create_calendar_sync,
    get_calendar_sync,
)
from app.repositories.meeting_repository import (
    create_meeting,
    get_meeting_by_identity,
    update_meeting,
)
from app.repositories.meeting_source_repository import (
    create_meeting_source,
    get_source_by_calendar_event,
    update_meeting_source,
)
from app.repositories.meeting_participant_repository import (
    create_participant,
    get_participant_by_email,
    update_participant,
)
from app.repositories.user_repository import get_user_by_email
from app.services.google_event_parser import (
    is_meeting_event,
    parse_google_event,
)
from app.services.raw_event_storage import save_raw_event


def sync_calendar_meetings(
    db: Session,
    user_id,
    calendar,
) -> int:
    """
    Synchronize Google Calendar events into MeetSync.

    Returns the number of unique meetings processed.
    """

    from app.services.google_calendar_service import list_calendar_events

    # Get or create synchronization state for this calendar.
    sync_state = get_calendar_sync(
        db=db,
        calendar_id=calendar.id,
    )

    if not sync_state:
        sync_state = create_calendar_sync(
            db=db,
            calendar_id=calendar.id,
        )

    sync_token = sync_state.sync_token

    sync_state.sync_status = "running"
    sync_state.last_error = None
    db.commit()

    processed_meeting_ids = set()

    try:
        # Fetch events from Google Calendar.
        events, next_sync_token = list_calendar_events(
            db=db,
            user_id=user_id,
            google_calendar_id=calendar.google_calendar_id,
            sync_token=sync_token,
        )

        for event in events:

            # Ignore non-meeting calendar events.
            if (
                event.get("status") != "cancelled"
                and not is_meeting_event(event)
            ):
                continue

            # Handle cancelled events.
            if event.get("status") == "cancelled":
                parsed = parse_google_event(event)

                meeting = None

                # 1. Try finding meeting via meeting_source
                source = get_source_by_calendar_event(
                    db=db,
                    calendar_id=calendar.id,
                    google_event_id=parsed["google_event_id"],
                )

                if source and source.meeting:
                    meeting = source.meeting
                elif parsed.get("google_ical_uid") and parsed.get("start_time"):
                    meeting = get_meeting_by_identity(
                        db=db,
                        google_ical_uid=parsed["google_ical_uid"],
                        start_time=parsed["start_time"],
                    )

                if meeting:
                    meeting.status = "cancelled"

                    raw_payload_path = save_raw_event(
                        google_event_id=parsed["google_event_id"],
                        event_data=event,
                    )

                    meeting.raw_payload_path = raw_payload_path

                    if source:
                        update_meeting_source(
                            source=source,
                            google_etag=parsed.get("google_etag"),
                            google_sequence=parsed.get("google_sequence"),
                            raw_payload_path=raw_payload_path,
                        )

                    processed_meeting_ids.add(meeting.id)

                continue

            parsed = parse_google_event(event)

            # Resolve the Google organizer to a MeetSync user.
            organizer_user = None

            if parsed["organizer_email"]:
                organizer_user = get_user_by_email(
                    db=db,
                    email=parsed["organizer_email"],
                )

            organizer_user_id = (
                organizer_user.id
                if organizer_user
                else None
            )

            # Save the complete Google event payload locally.
            raw_payload_path = save_raw_event(
                google_event_id=parsed["google_event_id"],
                event_data=event,
            )

            # Find the logical MeetSync meeting.
            meeting = None

            if parsed["google_ical_uid"]:
                meeting = get_meeting_by_identity(
                    db=db,
                    google_ical_uid=parsed["google_ical_uid"],
                    start_time=parsed["start_time"],
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
                    organizer_user_id=organizer_user_id,
                    organizer_email=parsed["organizer_email"],
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
                    organizer_user_id=organizer_user_id,
                    organizer_email=parsed["organizer_email"],
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

            # Synchronize meeting participants.
            for attendee in parsed["attendees"]:
                email = attendee.get("email")

                if not email:
                    continue

                user = get_user_by_email(
                    db=db,
                    email=email,
                )

                attendee_user_id = (
                    user.id
                    if user
                    else None
                )

                is_organizer = attendee.get("organizer") or (
                    parsed["organizer_email"]
                    and email.lower() == parsed["organizer_email"].lower()
                )

                participant = get_participant_by_email(
                    db=db,
                    meeting_id=meeting.id,
                    email=email,
                )

                if participant:
                    # Preserve manually assigned roles across syncs
                    if participant.role in ("note_taker", "personal_assistant") and not is_organizer:
                        role = participant.role
                    elif is_organizer:
                        role = "agenda_owner"
                    else:
                        role = "participant"

                    update_participant(
                        participant=participant,
                        user_id=attendee_user_id or participant.user_id,
                        role=role,
                        response_status=attendee.get("responseStatus"),
                    )

                else:
                    role = "agenda_owner" if is_organizer else "participant"
                    create_participant(
                        db=db,
                        meeting_id=meeting.id,
                        email=email,
                        user_id=attendee_user_id,
                        role=role,
                        response_status=attendee.get("responseStatus"),
                    )

            # Ensure agenda_owner participant record exists even if Google omitted organizer from attendees
            if parsed["organizer_email"]:
                org_participant = get_participant_by_email(
                    db=db,
                    meeting_id=meeting.id,
                    email=parsed["organizer_email"],
                )
                if not org_participant:
                    create_participant(
                        db=db,
                        meeting_id=meeting.id,
                        email=parsed["organizer_email"],
                        user_id=organizer_user_id,
                        role="agenda_owner",
                        response_status="accepted",
                    )
                else:
                    org_participant.role = "agenda_owner"
                    if organizer_user_id and not org_participant.user_id:
                        org_participant.user_id = organizer_user_id

            processed_meeting_ids.add(meeting.id)

        # Update synchronization state after successful processing.
        if next_sync_token:
            sync_state.sync_token = next_sync_token

        sync_state.last_synced_at = datetime.now(timezone.utc)
        sync_state.sync_status = "success"
        sync_state.last_error = None

        db.commit()

    except Exception as exc:
        # Roll back the failed transaction first.
        db.rollback()

        # Record the synchronization failure in a fresh transaction.
        sync_state = get_calendar_sync(
            db=db,
            calendar_id=calendar.id,
        )

        if sync_state:
            sync_state.sync_status = "failed"
            sync_state.last_error = str(exc)
            db.commit()

        raise

    return len(processed_meeting_ids)