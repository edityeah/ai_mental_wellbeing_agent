"""Allow system_recap as a message role

Revision ID: 0003_system_recap_role
Revises: 0002_voice_sessions
Create Date: 2026-06-02 00:00:00.000000

Adds `system_recap` to the messages.role CHECK constraint so the voice
worker / chat service can persist Care Plan summary bubbles at the end
of a conversation.
"""
from alembic import op

revision = "0003_system_recap_role"
down_revision = "0002_voice_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_messages_role", "messages", type_="check")
    op.create_check_constraint(
        "ck_messages_role",
        "messages",
        "role IN ('user','assistant','system_crisis','system_recap')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_messages_role", "messages", type_="check")
    op.create_check_constraint(
        "ck_messages_role",
        "messages",
        "role IN ('user','assistant','system_crisis')",
    )
