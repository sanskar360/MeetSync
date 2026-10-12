from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


MeetingRoleType = Literal["agenda_owner", "note_taker", "personal_assistant", "participant"]
AssignableRoleType = Literal["note_taker", "personal_assistant", "participant"]


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
