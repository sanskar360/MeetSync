import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import (
    get_current_user,
    get_meeting_role,
    require_meeting_member,
    require_meeting_roles,
)
from app.models.meeting import Meeting
from app.models.meeting_participant import MeetingParticipant
from app.models.user import User
from app.repositories.meeting_participant_repository import (
    get_participant_by_id,
    update_participant_role,
)
from app.schemas.meeting import (
    MeetingSummaryResponse,
    ParticipantListResponse,
    ParticipantResponse,
    RoleUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/meetings",
    tags=["Meetings"],
)


@router.get("", response_model=list[MeetingSummaryResponse])
def list_user_meetings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lists meetings in which the current user is a participant or organizer.
    """
    offset = (page - 1) * limit

    # Query meetings where user is either organizer or participant
    participated_meeting_ids = (
        db.query(MeetingParticipant.meeting_id)
        .filter(
            (MeetingParticipant.user_id == current_user.id)
            | (MeetingParticipant.email.ilike(current_user.email))
        )
        .subquery()
    )

    query = (
        db.query(Meeting)
        .filter(
            (Meeting.organizer_user_id == current_user.id)
            | (Meeting.organizer_email.ilike(current_user.email))
            | (Meeting.id.in_(participated_meeting_ids))
        )
        .order_by(Meeting.start_time.desc())
        .offset(offset)
        .limit(limit)
    )

    meetings = query.all()

    results = []
    for m in meetings:
        _, role = get_meeting_role(meeting_id=m.id, user=current_user, db=db)
        results.append(
            MeetingSummaryResponse(
                id=m.id,
                google_event_id=m.google_event_id,
                title=m.title,
                start_time=m.start_time,
                end_time=m.end_time,
                status=m.status,
                meet_url=m.meet_url,
                organizer_email=m.organizer_email,
                user_role=role,
            )
        )

    return results


@router.get("/{meeting_id}", response_model=MeetingSummaryResponse)
def get_meeting(
    meeting_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
):
    """
    Retrieves meeting details for an authorized meeting member.
    """
    meeting, role = auth_context
    return MeetingSummaryResponse(
        id=meeting.id,
        google_event_id=meeting.google_event_id,
        title=meeting.title,
        start_time=meeting.start_time,
        end_time=meeting.end_time,
        status=meeting.status,
        meet_url=meeting.meet_url,
        organizer_email=meeting.organizer_email,
        user_role=role,
    )


@router.get("/{meeting_id}/participants", response_model=ParticipantListResponse)
def list_meeting_participants(
    meeting_id: UUID,
    auth_context: tuple[Meeting, str] = Depends(require_meeting_member),
    db: Session = Depends(get_db),
):
    """
    Lists all participants for a meeting. Accessible to all meeting members.
    """
    participants = (
        db.query(MeetingParticipant)
        .filter(MeetingParticipant.meeting_id == meeting_id)
        .all()
    )

    return ParticipantListResponse(
        meeting_id=meeting_id,
        participants=participants,
        count=len(participants),
    )


@router.patch(
    "/{meeting_id}/participants/{participant_id}/role",
    response_model=ParticipantResponse,
)
def update_meeting_participant_role(
    meeting_id: UUID,
    participant_id: UUID,
    body: RoleUpdateRequest,
    auth_context: tuple[Meeting, str] = Depends(
        require_meeting_roles(["agenda_owner"])
    ),
    db: Session = Depends(get_db),
):
    """
    Allows the Agenda Owner to assign participant roles
    (note_taker, personal_assistant, participant).
    """
    participant = get_participant_by_id(
        db=db,
        participant_id=participant_id,
        meeting_id=meeting_id,
    )

    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found for this meeting.",
        )

    # Protect Agenda Owner from demoting themselves or other agenda owners via this route
    if participant.role in ("agenda_owner", "organizer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reassign the role of the Agenda Owner.",
        )

    updated_participant = update_participant_role(
        db=db,
        participant=participant,
        role=body.role,
    )

    logger.info(
        f"Participant {participant_id} role updated to '{body.role}' in meeting {meeting_id}"
    )

    return updated_participant
