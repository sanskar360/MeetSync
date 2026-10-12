from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ActionItemSchema(BaseModel):
    description: str = Field(..., min_length=1, max_length=500, strip_whitespace=True)
    assignee_email: str | None = None
    is_completed: bool = False
    due_date: datetime | None = None


class NoteCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, strip_whitespace=True)
    content: str = Field(..., min_length=1, strip_whitespace=True)
    action_items: list[ActionItemSchema] = Field(default_factory=list)


class NoteUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255, strip_whitespace=True)
    content: str | None = Field(None, min_length=1, strip_whitespace=True)
    action_items: list[ActionItemSchema] | None = None


class NoteResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    author_user_id: UUID
    title: str
    content: str
    action_items: list[ActionItemSchema]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NoteListResponse(BaseModel):
    meeting_id: UUID
    notes: list[NoteResponse]
    count: int
