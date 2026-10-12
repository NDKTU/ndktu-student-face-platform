"""Zoom seansi: o'qituvchi

Seansga darsni olib boradigan o'qituvchi biriktiriladi (`users.id`): u
seansni boshqaradi, yuz tekshiruvisiz kiradi va host sifatida boshlaydi.
Fan shu o'qituvchining fanlaridan tanlanadi.

Revision ID: f2c6a8e4b1d7
Revises: e3b9c5a7d1f4
Create Date: 2026-10-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2c6a8e4b1d7"
down_revision: Union[str, Sequence[str], None] = "e3b9c5a7d1f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "zoom_sessions",
        sa.Column(
            "teacher_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_zoom_sessions_teacher_user_id", "zoom_sessions", ["teacher_user_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_zoom_sessions_teacher_user_id", table_name="zoom_sessions")
    op.drop_column("zoom_sessions", "teacher_user_id")
