"""add notes and transcripts tables and migrate participant roles

Revision ID: e18f2d9b4c02
Revises: c7a19d83e201
Create Date: 2026-10-11 20:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e18f2d9b4c02'
down_revision: Union[str, Sequence[str], None] = 'c7a19d83e201'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Data migration: Update existing 'organizer' roles to 'agenda_owner'
    op.execute(
        "UPDATE meeting_participants SET role = 'agenda_owner' WHERE role = 'organizer'"
    )

    # 2. Create meeting_notes table
    op.create_table(
        'meeting_notes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('meeting_id', sa.UUID(), nullable=False),
        sa.Column('author_user_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column(
            'action_items',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_meeting_notes_meeting_id'),
        'meeting_notes',
        ['meeting_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_meeting_notes_created_at'),
        'meeting_notes',
        ['created_at'],
        unique=False,
    )

    # 3. Create transcripts table
    op.create_table(
        'transcripts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('meeting_id', sa.UUID(), nullable=False),
        sa.Column('uploaded_by_user_id', sa.UUID(), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('storage_path', sa.String(length=1024), nullable=False),
        sa.Column('file_format', sa.String(length=50), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('content_text', sa.Text(), nullable=False),
        sa.Column(
            'validation_status',
            sa.String(length=50),
            server_default='ACCEPTED',
            nullable=False,
        ),
        sa.Column(
            'validation_flags',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_transcripts_meeting_created'),
        'transcripts',
        ['meeting_id', 'created_at'],
        unique=False,
    )
    op.create_index(
        op.f('ix_transcripts_validation_status'),
        'transcripts',
        ['validation_status'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_transcripts_validation_status'), table_name='transcripts')
    op.drop_index(op.f('ix_transcripts_meeting_created'), table_name='transcripts')
    op.drop_table('transcripts')

    op.drop_index(op.f('ix_meeting_notes_created_at'), table_name='meeting_notes')
    op.drop_index(op.f('ix_meeting_notes_meeting_id'), table_name='meeting_notes')
    op.drop_table('meeting_notes')

    op.execute(
        "UPDATE meeting_participants SET role = 'organizer' WHERE role = 'agenda_owner'"
    )
