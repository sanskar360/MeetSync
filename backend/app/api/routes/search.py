from datetime import datetime, timezone
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user,
    require_meeting_member,
)
from app.models.meeting import Meeting
from app.models.meeting_note import MeetingNote
from app.models.meeting_participant import MeetingParticipant
from app.models.transcript import Transcript
from app.models.user import User
from app.schemas.meeting import ParticipantResponse
from app.schemas.note import ActionItemSchema, NoteResponse
from app.schemas.search import (
    MeetingDetailResponse,
    MeetingSearchQuery,
    MeetingSearchResponse,
)
from app.schemas.transcript import (
    TranscriptResponse,
    ValidationReportSchema,
)
from app.services.search_service import search_meetings_for_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/meetings",
    tags=["Search & Details"],
)


@router.get("/search", response_model=MeetingSearchResponse)
def search_meetings(
    query: Annotated[MeetingSearchQuery, Depends()],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Search and browse meetings across titles, notes, and transcripts.
    Strictly scoped to meetings where the authenticated user is an authorized member.
    Personal Assistants can filter by role to review delegated meeting portfolios.
    """
    results, total = search_meetings_for_user(
        db=db,
        user=current_user,
        query=query,
    )

    return MeetingSearchResponse(
        results=results,
        total=total,
        page=query.page,
        limit=query.limit,
    )


@router.get("/past", response_model=MeetingSearchResponse)
def get_past_meetings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Browse past meetings archive for the authenticated user.
    """
    now = datetime.now(timezone.utc)
    query = MeetingSearchQuery(
        end_date=now,
        page=page,
        limit=limit,
    )

    results, total = search_meetings_for_user(
        db=db,
        user=current_user,
        query=query,
    )

    return MeetingSearchResponse(
        results=results,
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{meeting_id}/details", response_model=MeetingDetailResponse)
def get_consolidated_meeting_details(
    meeting_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Returns a consolidated meeting view including participants, notes,
    and transcript metadata for authorized meeting members.
    """
    meeting, role = auth_context

    participants = (
        db.query(MeetingParticipant)
        .filter(MeetingParticipant.meeting_id == meeting.id)
        .all()
    )

    notes = (
        db.query(MeetingNote)
        .filter(MeetingNote.meeting_id == meeting.id)
        .order_by(MeetingNote.created_at.desc())
        .all()
    )

    transcripts = (
        db.query(Transcript)
        .filter(Transcript.meeting_id == meeting.id)
        .order_by(Transcript.created_at.desc())
        .all()
    )

    note_responses = [
        NoteResponse(
            id=n.id,
            meeting_id=n.meeting_id,
            author_user_id=n.author_user_id,
            title=n.title,
            content=n.content,
            action_items=[
                ActionItemSchema(**item) if isinstance(item, dict) else item
                for item in (n.action_items or [])
            ],
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]

    transcript_responses = []
    for t in transcripts:
        report = t.validation_flags or {}
        transcript_responses.append(
            TranscriptResponse(
                id=t.id,
                meeting_id=t.meeting_id,
                uploaded_by_user_id=t.uploaded_by_user_id,
                original_filename=t.original_filename,
                file_format=t.file_format,
                file_size=t.file_size,
                validation_status=t.validation_status,
                validation_report=ValidationReportSchema(
                    status=t.validation_status,
                    participant_mismatch=report.get("participant_mismatch", False),
                    timestamp_match=report.get("timestamp_match", True),
                    format_valid=report.get("format_valid", True),
                    detected_speakers=report.get("detected_speakers", []),
                    warnings=report.get("warnings", []),
                    word_count=report.get("word_count", 0),
                    details=report.get("details", {}),
                ),
                created_at=t.created_at,
            )
        )

    return MeetingDetailResponse(
        id=meeting.id,
        google_event_id=meeting.google_event_id,
        title=meeting.title,
        start_time=meeting.start_time,
        end_time=meeting.end_time,
        status=meeting.status,
        meet_url=meeting.meet_url,
        organizer_email=meeting.organizer_email,
        user_role=role,
        participants=[ParticipantResponse.model_validate(p) for p in participants],
        notes=note_responses,
        transcripts=transcript_responses,
    )
