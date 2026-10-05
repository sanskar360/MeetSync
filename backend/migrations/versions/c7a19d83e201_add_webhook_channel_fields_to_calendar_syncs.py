"""add webhook channel fields to calendar_syncs

Revision ID: c7a19d83e201
Revises: b4836eb6bb2d
Create Date: 2026-09-27 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7a19d83e201'
down_revision: Union[str, Sequence[str], None] = 'b4836eb6bb2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('calendar_syncs', sa.Column('channel_id', sa.String(), nullable=True))
    op.add_column('calendar_syncs', sa.Column('resource_id', sa.String(), nullable=True))
    op.add_column('calendar_syncs', sa.Column('channel_expiration', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_calendar_syncs_channel_id'), 'calendar_syncs', ['channel_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_calendar_syncs_channel_id'), table_name='calendar_syncs')
    op.drop_column('calendar_syncs', 'channel_expiration')
    op.drop_column('calendar_syncs', 'resource_id')
    op.drop_column('calendar_syncs', 'channel_id')
