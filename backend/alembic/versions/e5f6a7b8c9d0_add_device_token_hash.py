"""add_device_token_hash

Revision ID: e5f6a7b8c9d0
Revises: 93cb4934e020
Create Date: 2026-07-22 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('devices', sa.Column('device_token_hash', sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column('devices', 'device_token_hash')
