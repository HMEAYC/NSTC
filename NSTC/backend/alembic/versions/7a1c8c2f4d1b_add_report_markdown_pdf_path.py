"""add report markdown and pdf_path

Revision ID: 7a1c8c2f4d1b
Revises: bfe047c97e6c
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a1c8c2f4d1b"
down_revision: Union[str, Sequence[str], None] = "bfe047c97e6c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("markdown", sa.Text(), nullable=True))
    op.add_column("reports", sa.Column("pdf_path", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "pdf_path")
    op.drop_column("reports", "markdown")
