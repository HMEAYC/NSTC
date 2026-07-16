"""fix schema consistency: create missing tables, fix names, add session columns

Revision ID: d2e3f4a5b6c7
Revises: c4d5e6f7a8b9
Create Date: 2026-07-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # ── 1. Create missing tables ──────────────────────────────────────

    op.create_table('devices',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('org_id', sa.String(36), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('device_id', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=True),
        sa.Column('firmware_version', sa.String(32), nullable=True),
        sa.Column('battery_level', sa.Float(), nullable=True),
        sa.Column('wifi_ssid', sa.String(64), nullable=True),
        sa.Column('wifi_rssi', sa.Float(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('mac_address', sa.String(17), nullable=True),
        sa.Column('status', sa.Enum('online', 'offline', name='device_status'), server_default='offline'),
        sa.Column('last_seen', sa.DateTime(), nullable=True),
        sa.Column('active_session_id', sa.String(36), sa.ForeignKey('sessions.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    op.create_table('children',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('org_id', sa.String(36), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('class_id', sa.String(36), sa.ForeignKey('classes.id'), nullable=True),
        sa.Column('added_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('student_id', sa.String(50), unique=True, nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    op.create_table('device_assignments',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id'), nullable=False),
        sa.Column('device_id', sa.String(36), sa.ForeignKey('devices.id'), nullable=False),
        sa.Column('child_id', sa.String(36), sa.ForeignKey('children.id'), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('method', sa.String(32), server_default='manual'),
        sa.Column('assigned_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('session_id', 'device_id', name='uq_session_device'),
    )

    op.create_table('wifi_config',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('device_id', sa.String(64), nullable=True, index=True),
        sa.Column('ssid', sa.String(100), nullable=False),
        sa.Column('password', sa.String(256), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )

    op.create_table('assessment_results',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id'), nullable=False),
        sa.Column('device_id', sa.String(36), sa.ForeignKey('devices.id'), nullable=True),
        sa.Column('child_id', sa.String(36), sa.ForeignKey('children.id'), nullable=True),
        sa.Column('activity_level', sa.Float(), nullable=True),
        sa.Column('smoothness', sa.Float(), nullable=True),
        sa.Column('stability_index', sa.Float(), nullable=True),
        sa.Column('sample_count', sa.Integer(), nullable=True),
        sa.Column('window_seconds', sa.Float(), nullable=True),
        sa.Column('computed_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('session_id', 'device_id', 'child_id',
                            name='uq_assessment_session_device_child'),
    )

    # ── 2. Fix table name mismatches ──────────────────────────────────

    # Drop stale tables from old migration names
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'courses' in existing_tables:
        op.drop_table('courses')

    if 'course_templates' in existing_tables:
        op.drop_table('course_templates')

    if 'course_evaluations' in existing_tables:
        op.drop_table('course_evaluations')

    # Create correctly-named tables
    op.create_table('session_templates',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('org_id', sa.String(36), sa.ForeignKey('organizations.id'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('stages', sa.JSON(), nullable=True),
        sa.Column('metrics_config', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    op.create_table('session_evaluations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id'), nullable=False),
        sa.Column('child_id', sa.String(36), sa.ForeignKey('children.id'), nullable=False),
        sa.Column('teacher_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('comment', sa.String(1000), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('session_id', 'child_id', name='uq_session_child'),
    )

    # ── 3. Add missing session columns ────────────────────────────────

    # Drop stale course_id FK and column if they exist
    existing_cols = {c['name'] for c in inspector.get_columns('sessions')}
    fks = inspector.get_foreign_keys('sessions')
    for fk in fks:
        if fk.get('referred_table') == 'courses':
            op.drop_constraint(fk['name'], 'sessions', type_='foreignkey')

    if 'course_id' in existing_cols:
        op.drop_column('sessions', 'course_id')

    if 'template_id' not in existing_cols:
        op.add_column('sessions', sa.Column('template_id', sa.String(36),
                      sa.ForeignKey('session_templates.id'), nullable=True))

    if 'name' not in existing_cols:
        op.add_column('sessions', sa.Column('name', sa.String(200), nullable=True))

    if 'description' not in existing_cols:
        op.add_column('sessions', sa.Column('description', sa.Text(), nullable=True))

    if 'current_activity_index' not in existing_cols:
        op.add_column('sessions', sa.Column('current_activity_index', sa.Integer(),
                      server_default='0'))

    if 'scheduled_at' not in existing_cols:
        op.add_column('sessions', sa.Column('scheduled_at', sa.DateTime(), nullable=True))

    # ── 4. Fix session_status enum to include all values ───────────────

    # PostgreSQL: recreate enum type with all values
    if dialect == 'postgresql':
        op.execute("ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'draft'")
        op.execute("ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'scheduled'")
        op.execute("ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'cancelled'")
    else:
        # For SQLite/other dialects, enum is just a string constraint
        pass


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {c['name'] for c in inspector.get_columns('sessions')}

    if 'scheduled_at' in existing_cols:
        op.drop_column('sessions', 'scheduled_at')
    if 'current_activity_index' in existing_cols:
        op.drop_column('sessions', 'current_activity_index')
    if 'description' in existing_cols:
        op.drop_column('sessions', 'description')
    if 'name' in existing_cols:
        op.drop_column('sessions', 'name')
    if 'template_id' in existing_cols:
        op.drop_column('sessions', 'template_id')

    op.drop_table('session_evaluations')
    op.drop_table('session_templates')
    op.drop_table('assessment_results')
    op.drop_table('wifi_config')
    op.drop_table('device_assignments')
    op.drop_table('children')
    op.drop_table('devices')
