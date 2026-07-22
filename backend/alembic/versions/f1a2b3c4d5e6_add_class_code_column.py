"""add class code column

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa


revision = "f1a2b3c4d5e6"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def _generate_code(name: str) -> str:
    if name.endswith("班"):
        name = name[:-1]
    return name[:10] if name else "C"


def upgrade():
    op.add_column("classes", sa.Column("code", sa.String(20), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, name FROM classes")).fetchall()
    for row in rows:
        code = _generate_code(row[1])
        conn.execute(
            sa.text("UPDATE classes SET code = :code WHERE id = :id"),
            {"code": code, "id": row[0]},
        )


def downgrade():
    op.drop_column("classes", "code")
