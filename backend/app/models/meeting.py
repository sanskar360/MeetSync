from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


if TYPE_CHECKING:
    from app.models.user import User
    from app.models.meeting_participant import MeetingParticipant
    from app.models.calendar import Calendar
    from app.models.meeting_source import MeetingSource
    from app.models.meeting_note import MeetingNote
    from app.models.transcript import Transcript



class Meeting(Base):
    __tablename__ = "meetings"

    __table_args__ = (
        UniqueConstraint(
            "google_ical_uid",
            "start_time",
            name="uq_meeting_ical_uid_start_time",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Google Calendar identifiers
    google_event_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    google_ical_uid: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    calendar_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("calendars.id"),
        nullable=False,
    )

    # Meeting information
    title: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    meet_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Organizer
    organizer_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    organizer_email: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    # Google Calendar synchronization fields
    event_type: Mapped[str] = mapped_column(
        String,
        default="default",
        nullable=False,
    )

    google_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    google_etag: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    google_sequence: Mapped[int | None] = mapped_column(
        nullable=True,
    )

    # MeetSync meeting status
    status: Mapped[str] = mapped_column(
        String,
        default="scheduled",
        nullable=False,
    )

    # Location of archived raw Google Calendar event
    raw_payload_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # MeetSync timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    organizer: Mapped["User | None"] = relationship(
        "User",
        back_populates="meetings",
    )

    participants: Mapped[list["MeetingParticipant"]] = relationship(
        "MeetingParticipant",
        back_populates="meeting",
    )

    sources: Mapped[list["MeetingSource"]] = relationship(
        "MeetingSource",
        back_populates="meeting",
    )

    calendar: Mapped["Calendar"] = relationship(
        "Calendar",
        back_populates="meetings",
    )

    notes: Mapped[list["MeetingNote"]] = relationship(
        "MeetingNote",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )

    transcripts: Mapped[list["Transcript"]] = relationship(
        "Transcript",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )