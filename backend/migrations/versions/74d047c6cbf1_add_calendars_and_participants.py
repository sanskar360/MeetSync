"""add calendars and participants

Revision ID: 74d047c6cbf1
Revises: 5b2a4b41f3bd
Create Date: 2026-09-13 12:21:52.294493

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "74d047c6cbf1"
down_revision: Union[str, Sequence[str], None] = "5b2a4b41f3bd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ---------------------------------------------------------
    # Create calendars table
    # ---------------------------------------------------------
    op.create_table(
        "calendars",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("google_calendar_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "google_calendar_id",
            name="uq_calendar_user_google_id",
        ),
    )

    # ---------------------------------------------------------
    # Recreate calendar_syncs table
    # ---------------------------------------------------------
    # The old calendar_syncs table is empty, so it is safe to
    # recreate it with calendar_id as UUID.
    op.drop_table("calendar_syncs")

    op.create_table(
        "calendar_syncs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("calendar_id", sa.UUID(), nullable=False),
        sa.Column("sync_token", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_status", sa.String(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("calendar_id"),
    )

    # ---------------------------------------------------------
    # Create meeting_participants table
    # ---------------------------------------------------------
    op.create_table(
        "meeting_participants",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("meeting_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("response_status", sa.String(), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["meeting_id"],
            ["meetings.id"],
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "meeting_id",
            "user_id",
            name="uq_meeting_participant",
        ),
    )

    # ---------------------------------------------------------
    # Change meetings.calendar_id from VARCHAR to UUID
    # ---------------------------------------------------------
    # PostgreSQL requires an explicit USING clause for this
    # type conversion.
    op.alter_column(
        "meetings",
        "calendar_id",
        existing_type=sa.VARCHAR(),
        type_=sa.UUID(),
        existing_nullable=False,
        postgresql_using="calendar_id::uuid",
    )

    # ---------------------------------------------------------
    # Replace unique google_event_id with composite uniqueness
    # ---------------------------------------------------------
    op.drop_constraint(
        op.f("meetings_google_event_id_key"),
        "meetings",
        type_="unique",
    )

    op.create_unique_constraint(
        "uq_meeting_calendar_event",
        "meetings",
        ["calendar_id", "google_event_id"],
    )

    # ---------------------------------------------------------
    # Add foreign key from meetings to calendars
    # ---------------------------------------------------------
    op.create_foreign_key(
        "fk_meetings_calendar_id",
        "meetings",
        "calendars",
        ["calendar_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""

    # ---------------------------------------------------------
    # Remove meetings -> calendars foreign key
    # ---------------------------------------------------------
    op.drop_constraint(
        "fk_meetings_calendar_id",
        "meetings",
        type_="foreignkey",
    )

    # ---------------------------------------------------------
    # Remove composite uniqueness
    # ---------------------------------------------------------
    op.drop_constraint(
        "uq_meeting_calendar_event",
        "meetings",
        type_="unique",
    )

    # ---------------------------------------------------------
    # Restore original google_event_id uniqueness
    # ---------------------------------------------------------
    op.create_unique_constraint(
        op.f("meetings_google_event_id_key"),
        "meetings",
        ["google_event_id"],
    )

    # ---------------------------------------------------------
    # Change meetings.calendar_id from UUID back to VARCHAR
    # ---------------------------------------------------------
    op.alter_column(
        "meetings",
        "calendar_id",
        existing_type=sa.UUID(),
        type_=sa.VARCHAR(),
        existing_nullable=False,
        postgresql_using="calendar_id::text",
    )

    # ---------------------------------------------------------
    # Remove new calendar_syncs table
    # ---------------------------------------------------------
    op.drop_table("calendar_syncs")

    # ---------------------------------------------------------
    # Recreate original calendar_syncs table
    # ---------------------------------------------------------
    op.create_table(
        "calendar_syncs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("calendar_id", sa.String(), nullable=False),
        sa.Column("sync_token", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_status", sa.String(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ---------------------------------------------------------
    # Remove meeting participants
    # ---------------------------------------------------------
    op.drop_table("meeting_participants")

    # ---------------------------------------------------------
    # Remove calendars
    # ---------------------------------------------------------
    op.drop_table("calendars")