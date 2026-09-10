import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Google Calendar identifiers
    google_event_id: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
    )

    calendar_id: Mapped[str] = mapped_column(
        String,
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
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )