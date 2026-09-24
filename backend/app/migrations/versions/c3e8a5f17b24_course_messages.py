"""Kurs chati: o'qituvchi va talabalarning umumiy muloqoti

Har bir kursda bitta umumiy xona. Xabar kurs bilan birga o'chadi, muallif
o'chirilsa esa xabar qoladi (`user_id` → NULL) — suhbat konteksti buzilmaydi.

`(course_id, id)` indeksi: chat oxirgi xabarlarni va «shundan keyingi
yangilarini» shu tartibda so'raydi.

Revision ID: c3e8a5f17b24
Revises: a4c7e2b91d05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3e8a5f17b24"
down_revision: Union[str, Sequence[str], None] = "a4c7e2b91d05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "course_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_course_messages_course_id_id", "course_messages", ["course_id", "id"])
    op.create_index("ix_course_messages_user_id", "course_messages", ["user_id"])


def downgrade() -> None:
    op.drop_table("course_messages")
