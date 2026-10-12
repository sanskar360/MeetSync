from sqlalchemy.orm import Session

from app.models.meeting_participant import MeetingParticipant


def get_participant_by_email(
    db: Session,
    meeting_id,
    email: str,
) -> MeetingParticipant | None:
    return (
        db.query(MeetingParticipant)
        .filter(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.email == email,
        )
        .first()
    )


def create_participant(
    db: Session,
    meeting_id,
    email: str,
    user_id=None,
    role: str = "participant",
    response_status: str | None = None,
) -> MeetingParticipant:
    participant = MeetingParticipant(
        meeting_id=meeting_id,
        user_id=user_id,
        email=email,
        role=role,
        response_status=response_status,
    )

    db.add(participant)
    db.flush()

    return participant


def update_participant(
    participant: MeetingParticipant,
    user_id=None,
    role: str = "participant",
    response_status: str | None = None,
) -> MeetingParticipant:
    participant.user_id = user_id
    participant.role = role
    participant.response_status = response_status

    return participant