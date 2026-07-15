"""add_music_columns_to_sessions

Revision ID: f7e2a1b3c4d5
Revises: 93cb4934e020
Create Date: 2026-07-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7e2a1b3c4d5'
down_revision: Union[str, Sequence[str], None] = '93cb4934e020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('music_file', sa.String(500), nullable=True))
    op.add_column('sessions', sa.Column('music_bpm', sa.Integer(), nullable=True))
    op.add_column('sessions', sa.Column('music_beat_times', sa.JSON(), nullable=True))
    op.add_column('sessions', sa.Column('music_stop_times', sa.JSON(), nullable=True))
    op.add_column('sessions', sa.Column('music_duration', sa.Integer(), nullable=True))
    op.add_column('sessions', sa.Column('music_element', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('sessions', 'music_element')
    op.drop_column('sessions', 'music_duration')
    op.drop_column('sessions', 'music_stop_times')
    op.drop_column('sessions', 'music_beat_times')
    op.drop_column('sessions', 'music_bpm')
    op.drop_column('sessions', 'music_file')
