"""voice_sessions table

Revision ID: 0002_voice_sessions
Revises: eb9d50148bef
Create Date: 2026-05-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_voice_sessions"
down_revision = "eb9d50148bef"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "voice_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("room_name", sa.Text, nullable=False, unique=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("duration_seconds", sa.Integer),
        sa.Column("end_reason", sa.Text),
        sa.Column("audio_egress_url", sa.Text),
        sa.CheckConstraint(
            "end_reason IS NULL OR end_reason IN ("
            "'user_hangup','silence_timeout','max_duration',"
            "'quota_exhausted','agent_crisis_redirect','error'"
            ")",
            name="ck_voice_sessions_end_reason",
        ),
    )
    op.create_index(
        "ix_voice_sessions_user_started",
        "voice_sessions",
        ["user_id", sa.text("started_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_voice_sessions_user_started", table_name="voice_sessions")
    op.drop_table("voice_sessions")
