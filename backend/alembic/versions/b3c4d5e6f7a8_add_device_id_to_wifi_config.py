"""add_device_id_to_wifi_config

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-07-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("wifi_config", sa.Column("device_id", sa.String(64), nullable=True))
    op.create_index("ix_wifi_config_device_id", "wifi_config", ["device_id"])


def downgrade() -> None:
    op.drop_index("ix_wifi_config_device_id", table_name="wifi_config")
    op.drop_column("wifi_config", "device_id")
