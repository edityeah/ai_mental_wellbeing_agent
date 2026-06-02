"""Add users.onboarded_at

Revision ID: 0004_users_onboarded_at
Revises: 0003_system_recap_role
Create Date: 2026-06-02 22:00:00.000000

Tracks when a user finished the in-app onboarding flow. NULL means they
haven't been through it — the (app) layout redirects them to /onboarding
on next page load.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_users_onboarded_at"
down_revision = "0003_system_recap_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "onboarded_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # Existing users who already have conversations are treated as
    # already onboarded — we don't want to drop them into the flow.
    op.execute(
        """
        UPDATE users
        SET onboarded_at = NOW()
        WHERE id IN (SELECT DISTINCT user_id FROM conversations)
        """
    )


def downgrade() -> None:
    op.drop_column("users", "onboarded_at")
