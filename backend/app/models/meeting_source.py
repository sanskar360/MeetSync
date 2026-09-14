import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.calendar import Calendar


class MeetingSource(Base):
    __tablename__ = "meeting_sources"

    __table_args__ = (
        UniqueConstraint(
            "calendar_id",
            "google_event_id",
            name="uq_meeting_source_calendar_event",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id"),
        nullable=False,
    )

    calendar_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("calendars.id"),
        nullable=False,
    )

    google_event_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    google_etag: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    google_sequence: Mapped[int | None] = mapped_column(
        nullable=True,
    )

    raw_payload_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

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

    meeting: Mapped["Meeting"] = relationship(
        "Meeting",
        back_populates="sources",
    )

    calendar: Mapped["Calendar"] = relationship(
        "Calendar",
        back_populates="meeting_sources",
    )