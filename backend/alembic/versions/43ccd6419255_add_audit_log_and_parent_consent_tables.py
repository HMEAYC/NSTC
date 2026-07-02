"""add audit_log and parent_consent tables

Revision ID: 43ccd6419255
Revises: 6f11ca848bb2
Create Date: 2026-07-02 21:40:56.132169

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '43ccd6419255'
down_revision: Union[str, Sequence[str], None] = '6f11ca848bb2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('audit_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('actor_id', sa.String(length=36), nullable=True),
        sa.Column('actor_email', sa.String(length=200), nullable=True),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('resource_type', sa.String(length=50), nullable=False),
        sa.Column('resource_id', sa.String(length=36), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table('parent_consents',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('child_id', sa.String(length=36), nullable=False),
        sa.Column('parent_id', sa.String(length=36), nullable=False),
        sa.Column('consented', sa.Boolean(), nullable=False),
        sa.Column('consent_file_path', sa.String(length=500), nullable=True),
        sa.Column('consented_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['child_id'], ['children.id'], ),
        sa.ForeignKeyConstraint(['parent_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('parent_consents')
    op.drop_table('audit_logs')
