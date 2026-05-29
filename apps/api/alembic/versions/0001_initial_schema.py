"""initial schema

Revision ID: eb9d50148bef
Revises:
Create Date: 2026-05-29 10:15:40.978797

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'eb9d50148bef'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(120)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "title",
            sa.String(200),
            nullable=False,
            server_default="New conversation",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_msg_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_conversations_user_last_msg", "conversations", ["user_id", "last_msg_at"]
    )

    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("source", sa.String(10), nullable=False, server_default="text"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("risk_level", sa.String(10)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("token_count", sa.Integer, nullable=False, server_default="0"),
        sa.CheckConstraint(
            "role IN ('user','assistant','system_crisis')", name="ck_messages_role"
        ),
        sa.CheckConstraint("source IN ('text','voice')", name="ck_messages_source"),
        sa.CheckConstraint(
            "risk_level IS NULL OR risk_level IN ('none','elevated','acute')",
            name="ck_messages_risk",
        ),
    )
    op.create_index(
        "ix_messages_conv_created", "messages", ["conversation_id", "created_at"]
    )

    op.create_table(
        "user_profiles",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "profile",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("summary", sa.Text, nullable=False, server_default=""),
        sa.Column("last_processed_msg_id", postgresql.UUID(as_uuid=True)),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "usage_daily",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("date", sa.Date, primary_key=True),
        sa.Column("text_msg_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("voice_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_in", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.BigInteger, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("usage_daily")
    op.drop_table("user_profiles")
    op.drop_index("ix_messages_conv_created", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversations_user_last_msg", table_name="conversations")
    op.drop_table("conversations")
    op.drop_table("users")
