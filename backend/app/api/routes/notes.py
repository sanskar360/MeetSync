import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user,
    require_meeting_member,
    require_meeting_roles,
)
from app.models.meeting import Meeting
from app.models.user import User
from app.repositories.meeting_note_repository import (
    create_note,
    delete_note,
    get_note_by_id,
    list_notes_by_meeting_id,
    update_note,
)
from app.schemas.note import (
    NoteCreateRequest,
    NoteListResponse,
    NoteResponse,
    NoteUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/meetings/{meeting_id}/notes",
    tags=["Notes"],
)


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
def create_meeting_note(
    meeting_id: UUID,
    body: NoteCreateRequest,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_roles(["note_taker"])),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Creates a new meeting note with structured action items.
    Strictly restricted to the designated Note Taker for this meeting.
    """
    meeting, _ = auth_context

    action_items_data = [item.model_dump() for item in body.action_items]

    note = create_note(
        db=db,
        meeting_id=meeting.id,
        author_user_id=current_user.id,
        title=body.title,
        content=body.content,
        action_items=action_items_data,
    )

    logger.info(f"Note {note.id} created by user {current_user.id} for meeting {meeting_id}")
    return note


@router.get("", response_model=NoteListResponse)
def list_meeting_notes(
    meeting_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Lists all notes for a meeting. Available to all authenticated meeting members.
    """
    meeting, _ = auth_context
    notes = list_notes_by_meeting_id(db=db, meeting_id=meeting.id)

    return NoteListResponse(
        meeting_id=meeting.id,
        notes=notes,
        count=len(notes),
    )


@router.get("/{note_id}", response_model=NoteResponse)
def get_single_note(
    meeting_id: UUID,
    note_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Retrieves a single note by ID. Available to all authenticated meeting members.
    """
    meeting, _ = auth_context
    note = get_note_by_id(db=db, note_id=note_id, meeting_id=meeting.id)

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found for this meeting.",
        )

    return note


@router.patch("/{note_id}", response_model=NoteResponse)
def update_meeting_note(
    meeting_id: UUID,
    note_id: UUID,
    body: NoteUpdateRequest,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_roles(["note_taker"])),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates a meeting note.
    Strictly restricted to the author of the note (who holds the Note Taker role).
    """
    meeting, _ = auth_context
    note = get_note_by_id(db=db, note_id=note_id, meeting_id=meeting.id)

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found for this meeting.",
        )

    if note.author_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the note's author can edit this note.",
        )

    action_items_data = (
        [item.model_dump() for item in body.action_items]
        if body.action_items is not None
        else None
    )

    updated = update_note(
        db=db,
        note=note,
        title=body.title,
        content=body.content,
        action_items=action_items_data,
    )

    logger.info(f"Note {note_id} updated by author {current_user.id}")
    return updated


@router.delete("/{note_id}")
def delete_meeting_note(
    meeting_id: UUID,
    note_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_roles(["note_taker"])),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deletes a meeting note.
    Strictly restricted to the author of the note (who holds the Note Taker role).
    """
    meeting, _ = auth_context
    note = get_note_by_id(db=db, note_id=note_id, meeting_id=meeting.id)

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found for this meeting.",
        )

    if note.author_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the note's author can delete this note.",
        )

    delete_note(db=db, note=note)
    logger.info(f"Note {note_id} deleted by author {current_user.id}")

    return {"message": "Note deleted successfully", "id": str(note_id)}
