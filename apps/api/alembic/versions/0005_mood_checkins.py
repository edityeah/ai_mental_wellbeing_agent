"""Add mood_checkins table

Revision ID: 0005_mood_checkins
Revises: 0004_users_onboarded_at
Create Date: 2026-06-02 22:30:00.000000

Daily 1-5 mood readings, one per user per day. Surfaced in the chat
empty state as a widget; passed to the Companion as context.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_mood_checkins"
down_revision = "0004_users_onboarded_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mood_checkins",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("date", sa.Date, primary_key=True),
        sa.Column("score", sa.Integer, nullable=False),
        sa.Column("note", sa.String(280), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("score BETWEEN 1 AND 5", name="ck_mood_score_range"),
    )


def downgrade() -> None:
    op.drop_table("mood_checkins")
