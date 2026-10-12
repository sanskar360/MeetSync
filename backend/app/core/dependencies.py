import logging
from typing import Callable
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.jwt import decode_access_token
from app.models.meeting import Meeting
from app.models.meeting_participant import MeetingParticipant
from app.models.user import User

logger = logging.getLogger(__name__)


def get_current_user(
    request: Request,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """
    Extracts and validates JWT from Authorization header or session cookie.
    Loads and returns the User entity from the database.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = None

    # 1. Try Bearer token in Authorization header
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    # 2. Try session cookie (for secure browser navigation)
    elif "meetsync_session" in request.cookies:
        token = request.cookies["meetsync_session"]

    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    user_id_str = payload.get("sub")

    if not user_id_str:
        raise credentials_exception

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise credentials_exception

    return user


def get_meeting_role(
    meeting_id: UUID,
    user: User,
    db: Session,
) -> tuple[Meeting, str]:
    """
    Evaluates the user's active role for a specific meeting.
    Returns (meeting, role).
    If the user has no role, role is 'none'.
    """
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    # 1. Check if user is the meeting organizer
    if (meeting.organizer_user_id and meeting.organizer_user_id == user.id) or (
        meeting.organizer_email and meeting.organizer_email.lower() == user.email.lower()
    ):
        return meeting, "agenda_owner"

    # 2. Check participant record by user_id or email
    participant = (
        db.query(MeetingParticipant)
        .filter(
            MeetingParticipant.meeting_id == meeting_id,
            (MeetingParticipant.user_id == user.id)
            | (MeetingParticipant.email.ilike(user.email)),
        )
        .first()
    )

    if participant:
        # Standardize 'organizer' to 'agenda_owner'
        if participant.role == "organizer":
            return meeting, "agenda_owner"
        return meeting, participant.role

    return meeting, "none"


def require_meeting_member(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[Meeting, str]:
    """
    Ensures the user is an active participant or agenda owner in the meeting.
    """
    meeting, role = get_meeting_role(meeting_id=meeting_id, user=current_user, db=db)
    if role == "none":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not a participant in this meeting.",
        )
    return meeting, role


def require_meeting_roles(allowed_roles: list[str]) -> Callable:
    """
    Factory dependency requiring the user to have one of the specified roles in the meeting.
    """
    def _role_checker(
        meeting_id: UUID,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> tuple[Meeting, str]:
        meeting, role = get_meeting_role(meeting_id=meeting_id, user=current_user, db=db)

        if role == "none":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not a participant in this meeting.",
            )

        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: This operation requires one of {allowed_roles} roles. Your role is '{role}'.",
            )

        return meeting, role

    return _role_checker
