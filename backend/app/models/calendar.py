from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.meeting import Meeting
    from app.models.meeting_source import MeetingSource
    from app.models.calendar_sync import CalendarSync


class Calendar(Base):
    __tablename__ = "calendars"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "google_calendar_id",
            name="uq_calendar_user_google_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    google_calendar_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
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

    user: Mapped["User"] = relationship(
        "User",
        back_populates="calendars",
    )

    meetings: Mapped[list["Meeting"]] = relationship(
        "Meeting",
        back_populates="calendar",
    )

    meeting_sources: Mapped[list["MeetingSource"]] = relationship(
        "MeetingSource",
        back_populates="calendar",
    )

    sync: Mapped["CalendarSync | None"] = relationship(
        "CalendarSync",
        back_populates="calendar",
        uselist=False,
)