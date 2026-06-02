"""Add messages.attachments

Revision ID: 0006_message_attachments
Revises: 0005_mood_checkins
Create Date: 2026-06-02 23:00:00.000000

JSONB array of attachments per user message. Initially supports images
(base64 data URLs) so the user can share screenshots, photos of notes,
prescriptions, etc. — passed to Claude vision in the next turn.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006_message_attachments"
down_revision = "0005_mood_checkins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("attachments", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("messages", "attachments")
