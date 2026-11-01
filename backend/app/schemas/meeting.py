import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


MeetingRoleType = Literal["agenda_owner", "note_taker", "personal_assistant", "participant"]
AssignableRoleType = Literal["note_taker", "personal_assistant", "participant"]

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AddParticipantRequest(BaseModel):
    """
    Schema for adding a new participant to an upcoming or ongoing meeting.
    Only the Agenda Owner is permitted to perform this operation.
    """

    email: str = Field(
        ...,
        description="Email address of the participant to add.",
    )
    role: AssignableRoleType = Field(
        default="participant",
        description="Role to assign (note_taker, personal_assistant, participant).",
    )

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        trimmed = v.strip().lower()
        if not trimmed:
            raise ValueError("Email cannot be empty.")
        if not EMAIL_REGEX.match(trimmed):
            raise ValueError("Invalid email format.")
        return trimmed


class RoleUpdateRequest(BaseModel):
    """
    Schema for updating a participant's role by the Agenda Owner.
    Agenda Owner cannot assign another user as agenda_owner through this endpoint.
    """
    role: AssignableRoleType = Field(
        ...,
        description="Target role for the participant (note_taker, personal_assistant, participant)",
    )


class ParticipantResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    user_id: UUID | None = None
    email: str
    role: str
    response_status: str | None = None
    joined_at: datetime | None = None
    is_registered: bool = False

    model_config = ConfigDict(from_attributes=True)


class ParticipantListResponse(BaseModel):
    meeting_id: UUID
    participants: list[ParticipantResponse]
    count: int


class MeetingSummaryResponse(BaseModel):
    id: UUID
    google_event_id: str
    title: str
    start_time: datetime
    end_time: datetime
    status: str
    meet_url: str | None = None
    organizer_email: str | None = None
    user_role: str | None = None

    model_config = ConfigDict(from_attributes=True)
