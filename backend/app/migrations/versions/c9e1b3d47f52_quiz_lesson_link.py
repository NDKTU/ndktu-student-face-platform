"""Testni darsga biriktirish imkoni

O'qituvchi dars sahifasidayoq shu darsga test tuza olishi kerak: hozir
test faqat fan va guruh bo'yicha yaratilardi, qaysi darsga tegishli ekani
hech qayerda saqlanmasdi.

Ustun ixtiyoriy: semestr yakuni yoki kurs darajasidagi testlar hech qaysi
darsga biriktirilmaydi. Dars o'chirilsa `lesson_id` NULL bo'ladi, test esa
qoladi — natijalar unga tayanadi.

Revision ID: c9e1b3d47f52
Revises: b7d4a2f9c108
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9e1b3d47f52"
down_revision: Union[str, Sequence[str], None] = "b7d4a2f9c108"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("quizzes", sa.Column("lesson_id", sa.Integer(), nullable=True))
    op.create_index("ix_quizzes_lesson_id", "quizzes", ["lesson_id"])
    op.create_foreign_key(
        "fk_quizzes_lesson_id_lessons",
        "quizzes",
        "lessons",
        ["lesson_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_quizzes_lesson_id_lessons", "quizzes", type_="foreignkey")
    op.drop_index("ix_quizzes_lesson_id", table_name="quizzes")
    op.drop_column("quizzes", "lesson_id")
