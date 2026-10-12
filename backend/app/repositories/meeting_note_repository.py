from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.meeting_note import MeetingNote


def create_note(
    db: Session,
    meeting_id: UUID,
    author_user_id: UUID,
    title: str,
    content: str,
    action_items: list[dict[str, Any]],
) -> MeetingNote:
    note = MeetingNote(
        meeting_id=meeting_id,
        author_user_id=author_user_id,
        title=title,
        content=content,
        action_items=action_items,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_note_by_id(
    db: Session,
    note_id: UUID,
    meeting_id: UUID | None = None,
) -> MeetingNote | None:
    query = db.query(MeetingNote).filter(MeetingNote.id == note_id)
    if meeting_id is not None:
        query = query.filter(MeetingNote.meeting_id == meeting_id)
    return query.first()


def list_notes_by_meeting_id(
    db: Session,
    meeting_id: UUID,
) -> list[MeetingNote]:
    return (
        db.query(MeetingNote)
        .filter(MeetingNote.meeting_id == meeting_id)
        .order_by(MeetingNote.created_at.desc())
        .all()
    )


def update_note(
    db: Session,
    note: MeetingNote,
    title: str | None = None,
    content: str | None = None,
    action_items: list[dict[str, Any]] | None = None,
) -> MeetingNote:
    if title is not None:
        note.title = title
    if content is not None:
        note.content = content
    if action_items is not None:
        note.action_items = action_items

    db.commit()
    db.refresh(note)
    return note


def delete_note(
    db: Session,
    note: MeetingNote,
) -> None:
    db.delete(note)
    db.commit()
