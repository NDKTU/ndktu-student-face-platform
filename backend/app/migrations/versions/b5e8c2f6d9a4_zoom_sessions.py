"""Zoom sahifasi: seanslar, guruhlar va yuz tekshiruvlari

Zoom endi darsning resursi emas: seans — havola + guruhlar + vaqt oralig'i.
`lesson_face_checks` va eski `zoom` resurslari tarix sifatida qoladi.

Revision ID: b5e8c2f6d9a4
Revises: a1d9e4b7c3f5
Create Date: 2026-10-09 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b5e8c2f6d9a4"
down_revision: Union[str, Sequence[str], None] = "a1d9e4b7c3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "zoom_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("link_url", sa.String(length=500), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("face_check_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_zoom_sessions_starts_at", "zoom_sessions", ["starts_at"])
    op.create_index("ix_zoom_sessions_ends_at", "zoom_sessions", ["ends_at"])
    op.create_index("ix_zoom_sessions_subject_id", "zoom_sessions", ["subject_id"])
    op.create_index("ix_zoom_sessions_created_by_user_id", "zoom_sessions", ["created_by_user_id"])

    op.create_table(
        "zoom_session_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("session_id", "group_id", name="uq_zoom_session_group"),
    )
    op.create_index("ix_zoom_session_groups_session_id", "zoom_session_groups", ["session_id"])
    op.create_index("ix_zoom_session_groups_group_id", "zoom_session_groups", ["group_id"])

    op.create_table(
        "zoom_face_checks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("image_name", sa.String(length=255), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_zoom_face_checks_session_id", "zoom_face_checks", ["session_id"])
    op.create_index("ix_zoom_face_checks_status", "zoom_face_checks", ["status"])
    op.create_index(
        "ix_zoom_face_checks_session_user_time", "zoom_face_checks", ["session_id", "user_id", "created_at"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("zoom_face_checks")
    op.drop_table("zoom_session_groups")
    op.drop_table("zoom_sessions")
