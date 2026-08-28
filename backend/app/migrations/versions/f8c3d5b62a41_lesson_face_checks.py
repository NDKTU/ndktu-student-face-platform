"""Jonli darsda yuz tekshiruvi jurnali

Zoom darsiga kirishda va dars davomida tasodifiy vaqtlarda talabaning yuzi
tekshiriladi. Har bir tekshiruv shu jadvalga yoziladi; surat faqat muammoli
holatda saqlanadi (fayl nomi `image_name` da).

Revision ID: f8c3d5b62a41
Revises: e6b2f4a91d70
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f8c3d5b62a41"
down_revision: Union[str, Sequence[str], None] = "e6b2f4a91d70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lesson_face_checks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("image_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_lesson_face_checks_lesson_id", "lesson_face_checks", ["lesson_id"])
    op.create_index("ix_lesson_face_checks_user_id", "lesson_face_checks", ["user_id"])
    op.create_index("ix_lesson_face_checks_status", "lesson_face_checks", ["status"])


def downgrade() -> None:
    op.drop_table("lesson_face_checks")
