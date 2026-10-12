from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.transcript import Transcript


def create_transcript(
    db: Session,
    meeting_id: UUID,
    uploaded_by_user_id: UUID,
    original_filename: str,
    storage_path: str,
    file_format: str,
    file_size: int,
    content_text: str,
    validation_status: str,
    validation_flags: dict[str, Any],
) -> Transcript:
    transcript = Transcript(
        meeting_id=meeting_id,
        uploaded_by_user_id=uploaded_by_user_id,
        original_filename=original_filename,
        storage_path=storage_path,
        file_format=file_format,
        file_size=file_size,
        content_text=content_text,
        validation_status=validation_status,
        validation_flags=validation_flags,
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)
    return transcript


def get_transcript_by_id(
    db: Session,
    transcript_id: UUID,
    meeting_id: UUID | None = None,
) -> Transcript | None:
    query = db.query(Transcript).filter(Transcript.id == transcript_id)
    if meeting_id is not None:
        query = query.filter(Transcript.meeting_id == meeting_id)
    return query.first()


def list_transcripts_by_meeting_id(
    db: Session,
    meeting_id: UUID,
) -> list[Transcript]:
    return (
        db.query(Transcript)
        .filter(Transcript.meeting_id == meeting_id)
        .order_by(Transcript.created_at.desc())
        .all()
    )


def delete_transcript(
    db: Session,
    transcript: Transcript,
) -> None:
    db.delete(transcript)
    db.commit()
