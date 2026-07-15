"""fix_music_bpm_duration_float

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('sessions', 'music_bpm', existing_type=sa.Integer(), type_=sa.Float(), existing_nullable=True)
    op.alter_column('sessions', 'music_duration', existing_type=sa.Integer(), type_=sa.Float(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('sessions', 'music_duration', existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=True)
    op.alter_column('sessions', 'music_bpm', existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=True)
