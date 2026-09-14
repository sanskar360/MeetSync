from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.google_credential import GoogleCredential
    from app.models.calendar import Calendar
    from app.models.meeting_participant import MeetingParticipant


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    google_sub: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    profile_picture: Mapped[str | None] = mapped_column(
        String,
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

    meetings: Mapped[list["Meeting"]] = relationship(
        "Meeting",
        back_populates="organizer",
    )

    google_credential: Mapped["GoogleCredential | None"] = relationship(
        "GoogleCredential",
        back_populates="user",
        uselist=False,
    )

    calendars: Mapped[list["Calendar"]] = relationship(
    "Calendar",
    back_populates="user",
    )

    meeting_participations: Mapped[list["MeetingParticipant"]] = relationship(
    "MeetingParticipant",
    back_populates="user",
    )