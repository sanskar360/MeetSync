from sqlalchemy.orm import Session

from app.models.meeting import Meeting


def get_meeting_by_identity(
    db: Session,
    google_ical_uid: str,
    start_time,
) -> Meeting | None:
    return (
        db.query(Meeting)
        .filter(
            Meeting.google_ical_uid == google_ical_uid,
            Meeting.start_time == start_time,
        )
        .first()
    )


def create_meeting(
    db: Session,
    google_ical_uid: str,
    calendar_id,
    google_event_id: str,
    title: str,
    start_time,
    end_time,
    meet_url: str | None,
    organizer_user_id=None,
    organizer_email: str | None = None,
    event_type: str = "default",
    google_updated_at=None,
    google_etag: str | None = None,
    google_sequence: int | None = None,
    status: str = "scheduled",
    raw_payload_path: str | None = None,
) -> Meeting:

    meeting = Meeting(
        google_ical_uid=google_ical_uid,
        google_event_id=google_event_id,
        calendar_id=calendar_id,
        title=title,
        start_time=start_time,
        end_time=end_time,
        meet_url=meet_url,
        organizer_user_id=organizer_user_id,
        organizer_email=organizer_email,
        event_type=event_type,
        google_updated_at=google_updated_at,
        google_etag=google_etag,
        google_sequence=google_sequence,
        status=status,
        raw_payload_path=raw_payload_path,
    )

    db.add(meeting)
    db.flush()

    return meeting


def update_meeting(
    meeting: Meeting,
    title: str,
    start_time,
    end_time,
    meet_url: str | None,
    organizer_user_id=None,
    organizer_email: str | None = None,
    event_type: str = "default",
    google_updated_at=None,
    google_etag: str | None = None,
    google_sequence: int | None = None,
    status: str = "scheduled",
    raw_payload_path: str | None = None,
) -> Meeting:

    meeting.title = title
    meeting.start_time = start_time
    meeting.end_time = end_time
    meeting.meet_url = meet_url
    meeting.organizer_user_id = organizer_user_id
    meeting.organizer_email = organizer_email
    meeting.event_type = event_type
    meeting.google_updated_at = google_updated_at
    meeting.google_etag = google_etag
    meeting.google_sequence = google_sequence
    meeting.status = status
    meeting.raw_payload_path = raw_payload_path

    return meeting