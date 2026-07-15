"""add_music_url_to_sessions

Revision ID: a1b2c3d4e5f6
Revises: f7e2a1b3c4d5
Create Date: 2026-07-15 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f7e2a1b3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('music_url', sa.String(1000), nullable=True))


def downgrade() -> None:
    op.drop_column('sessions', 'music_url')
