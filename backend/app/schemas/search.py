from datetime import datetime
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.meeting import ParticipantResponse
from app.schemas.note import NoteResponse
from app.schemas.transcript import TranscriptResponse

MeetingRoleFilter = Literal["agenda_owner", "note_taker", "personal_assistant", "participant"]


class MeetingSearchQuery(BaseModel):
    q: str | None = Field(None, max_length=200)
    start_date: datetime | None = None
    end_date: datetime | None = None
    role: MeetingRoleFilter | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="before")
    @classmethod
    def clean_empty_params(cls, data: Any) -> Any:
        if isinstance(data, dict):
            cleaned = {}
            for k, v in data.items():
                if isinstance(v, str) and not v.strip():
                    cleaned[k] = None
                else:
                    cleaned[k] = v
            return cleaned
        return data

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must be less than or equal to end_date")
        return self


class MeetingSearchResult(BaseModel):
    meeting_id: UUID
    title: str
    start_time: datetime
    end_time: datetime
    status: str
    organizer_email: str | None = None
    user_role: str | None = None
    matching_notes_count: int = 0
    matching_transcripts_count: int = 0
    snippets: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class MeetingSearchResponse(BaseModel):
    results: list[MeetingSearchResult]
    total: int
    page: int
    limit: int


class MeetingDetailResponse(BaseModel):
    id: UUID
    google_event_id: str
    title: str
    start_time: datetime
    end_time: datetime
    status: str
    meet_url: str | None = None
    organizer_email: str | None = None
    user_role: str
    participants: list[ParticipantResponse]
    notes: list[NoteResponse]
    transcripts: list[TranscriptResponse]

    model_config = ConfigDict(from_attributes=True)
