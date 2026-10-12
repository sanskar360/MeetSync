from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ValidationStatus = Literal["ACCEPTED", "NEEDS_REVIEW", "REJECTED"]


class ValidationReportSchema(BaseModel):
    status: ValidationStatus
    participant_mismatch: bool = False
    timestamp_match: bool = True
    format_valid: bool = True
    detected_speakers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    word_count: int = 0
    details: dict[str, Any] = Field(default_factory=dict)


class TranscriptResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    uploaded_by_user_id: UUID
    original_filename: str
    file_format: str
    file_size: int
    validation_status: str
    validation_report: ValidationReportSchema
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TranscriptTextResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    content_text: str
    word_count: int

    model_config = ConfigDict(from_attributes=True)


class TranscriptListResponse(BaseModel):
    meeting_id: UUID
    transcripts: list[TranscriptResponse]
    count: int
