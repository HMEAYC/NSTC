"""add_wifi_fields_to_device

Revision ID: 93cb4934e020
Revises: 01d302e27d4a
Create Date: 2026-07-05 07:26:12.090026

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '93cb4934e020'
down_revision: Union[str, Sequence[str], None] = '01d302e27d4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('devices', sa.Column('wifi_ssid', sa.String(64), nullable=True))
    op.add_column('devices', sa.Column('wifi_rssi', sa.Float(), nullable=True))
    op.add_column('devices', sa.Column('ip_address', sa.String(45), nullable=True))
    op.add_column('devices', sa.Column('mac_address', sa.String(17), nullable=True))


def downgrade() -> None:
    op.drop_column('devices', 'mac_address')
    op.drop_column('devices', 'ip_address')
    op.drop_column('devices', 'wifi_rssi')
    op.drop_column('devices', 'wifi_ssid')
