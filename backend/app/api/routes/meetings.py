import logging
from datetime import datetime, timezone
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
    create_participant,
    get_participant_by_email,
    get_participant_by_id,
    update_participant_role,
)
from app.schemas.meeting import (
    AddParticipantRequest,
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

    # Auto-link unlinked participants if user registered
    unlinked = [p for p in participants if p.user_id is None]
    if unlinked:
        unlinked_emails = [p.email.lower() for p in unlinked]
        found_users = db.query(User).filter(User.email.in_(unlinked_emails)).all()
        user_map = {u.email.lower(): u.id for u in found_users}
        changed = False
        for p in unlinked:
            if p.email.lower() in user_map:
                p.user_id = user_map[p.email.lower()]
                changed = True
        if changed:
            db.commit()

    participant_responses = [
        ParticipantResponse(
            id=p.id,
            meeting_id=p.meeting_id,
            user_id=p.user_id,
            email=p.email,
            role=p.role,
            response_status=p.response_status,
            joined_at=p.joined_at,
            is_registered=p.user_id is not None,
        )
        for p in participants
    ]

    return ParticipantListResponse(
        meeting_id=meeting_id,
        participants=participant_responses,
        count=len(participant_responses),
    )


@router.post(
    "/{meeting_id}/participants",
    response_model=ParticipantResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_meeting_participant(
    meeting_id: UUID,
    body: AddParticipantRequest,
    auth_context: tuple[Meeting, str] = Depends(
        require_meeting_roles(["agenda_owner"])
    ),
    db: Session = Depends(get_db),
):
    """
    Allows the Agenda Owner to add a new participant to a meeting.
    """
    meeting, _ = auth_context
    now = datetime.now(timezone.utc)

    # ── Validation 1: Meeting must NOT be cancelled ──────────────────────────
    if meeting.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add a participant to a cancelled meeting.",
        )

    # ── Validation 2: Meeting must be upcoming or ongoing ────────────────────
    start_time = meeting.start_time
    end_time = meeting.end_time

    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    is_upcoming = start_time > now
    is_ongoing = start_time <= now <= end_time

    if not (is_upcoming or is_ongoing):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Participants can only be added to upcoming or ongoing meetings. "
                "This meeting has already ended."
            ),
        )

    # ── Validation 3: Email must not already be a participant ─────────────────
    email_lower = body.email.lower()
    existing = get_participant_by_email(
        db=db,
        meeting_id=meeting_id,
        email=email_lower,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A participant with the email '{body.email}' already exists in this meeting.",
        )

    existing_ilike = (
        db.query(MeetingParticipant)
        .filter(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.email.ilike(email_lower),
        )
        .first()
    )
    if existing_ilike:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A participant with the email '{body.email}' already exists in this meeting.",
        )

    # ── Validation 4: User must already exist as a registered MeetSync user ─
    registered_user = (
        db.query(User)
        .filter(User.email.ilike(email_lower))
        .first()
    )
    if not registered_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"User with email '{body.email}' is not registered in MeetSync. "
                "Only existing MeetSync users can be added as participants."
            ),
        )
    user_id = registered_user.id

    # ── Create the participant record ─────────────────────────────────────────
    new_participant = create_participant(
        db=db,
        meeting_id=meeting_id,
        email=body.email.lower(),
        user_id=user_id,
        role=body.role,
        response_status="accepted",
    )

    db.commit()
    db.refresh(new_participant)

    logger.info(
        "Participant '%s' (role=%s) added to meeting %s by agenda_owner",
        body.email,
        body.role,
        meeting_id,
    )

    return ParticipantResponse(
        id=new_participant.id,
        meeting_id=new_participant.meeting_id,
        user_id=new_participant.user_id,
        email=new_participant.email,
        role=new_participant.role,
        response_status=new_participant.response_status,
        joined_at=new_participant.joined_at,
        is_registered=True,
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

    Validations enforced:
    - Caller must be the Agenda Owner.
    - Agenda Owner cannot be reassigned.
    - Unregistered users (not signed up on MeetSync) cannot be assigned as
      note_taker or personal_assistant.
    - Single role exclusivity: when assigning note_taker or personal_assistant,
      any previous holder of that specific role in the meeting is demoted to participant.
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

    # ── Validation: Check registration status if assigning note_taker or personal_assistant
    if body.role in ("note_taker", "personal_assistant"):
        registered_user = None
        if participant.user_id:
            registered_user = db.query(User).filter(User.id == participant.user_id).first()
        if not registered_user:
            registered_user = db.query(User).filter(User.email.ilike(participant.email)).first()
            if registered_user:
                participant.user_id = registered_user.id
                db.flush()

        if not registered_user:
            role_label = "Note Taker" if body.role == "note_taker" else "Personal Assistant"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot assign {role_label} to '{participant.email}' because this user "
                    "is not registered on MeetSync. Only registered users who can sign in can hold this role."
                ),
            )

        # ── Single holder exclusivity: demote any other participant who holds this role
        db.query(MeetingParticipant).filter(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.id != participant.id,
            MeetingParticipant.role == body.role,
        ).update({"role": "participant"}, synchronize_session=False)

    updated_participant = update_participant_role(
        db=db,
        participant=participant,
        role=body.role,
    )

    logger.info(
        f"Participant {participant_id} role updated to '{body.role}' in meeting {meeting_id}"
    )

    return ParticipantResponse(
        id=updated_participant.id,
        meeting_id=updated_participant.meeting_id,
        user_id=updated_participant.user_id,
        email=updated_participant.email,
        role=updated_participant.role,
        response_status=updated_participant.response_status,
        joined_at=updated_participant.joined_at,
        is_registered=updated_participant.user_id is not None,
    )
