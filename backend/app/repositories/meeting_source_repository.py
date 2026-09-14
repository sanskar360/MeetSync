from sqlalchemy.orm import Session

from app.models.meeting_source import MeetingSource


def get_source_by_calendar_event(
    db: Session,
    calendar_id,
    google_event_id: str,
) -> MeetingSource | None:
    return (
        db.query(MeetingSource)
        .filter(
            MeetingSource.calendar_id == calendar_id,
            MeetingSource.google_event_id == google_event_id,
        )
        .first()
    )


def create_meeting_source(
    db: Session,
    meeting_id,
    calendar_id,
    google_event_id: str,
    google_etag: str | None = None,
    google_sequence: int | None = None,
    raw_payload_path: str | None = None,
) -> MeetingSource:
    source = MeetingSource(
        meeting_id=meeting_id,
        calendar_id=calendar_id,
        google_event_id=google_event_id,
        google_etag=google_etag,
        google_sequence=google_sequence,
        raw_payload_path=raw_payload_path,
    )

    db.add(source)
    db.flush()

    return source

def update_meeting_source(
    source: MeetingSource,
    google_etag: str | None = None,
    google_sequence: int | None = None,
    raw_payload_path: str | None = None,
) -> MeetingSource:
    source.google_etag = google_etag
    source.google_sequence = google_sequence
    source.raw_payload_path = raw_payload_path

    return source