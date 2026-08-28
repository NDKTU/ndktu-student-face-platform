"""Bir darsga — bitta uy vazifasi

Dars sahifasida uy vazifasi bittaligi kutiladi: talaba nimani topshirishini
aniq bilishi, o'qituvchi esa ishlarni bitta joyda tekshirishi kerak. Shu
sababli `homeworks.lesson_id` ustuniga qisman unikal indeks qo'yiladi.

Indeks qisman: `lesson_id IS NULL` bo'lgan (kurs darajasidagi) vazifalar
cheklovga tushmaydi va ular bir nechta bo'lishi mumkin.

Mavjud dublikatlar o'chirilmaydi — faqat darsdan uziladi (`lesson_id = NULL`),
chunki ularda talabalarning topshirgan ishlari bo'lishi mumkin. Darsda
topshiriqlari eng ko'p bo'lgan vazifa qoladi; teng bo'lsa — eng oxirgisi.

Revision ID: b7d4a2f9c108
Revises: a1c3e5f70b28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7d4a2f9c108"
down_revision: Union[str, Sequence[str], None] = "a1c3e5f70b28"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        WITH ranked AS (
            SELECT
                h.id,
                ROW_NUMBER() OVER (
                    PARTITION BY h.lesson_id
                    ORDER BY (
                        SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id
                    ) DESC, h.id DESC
                ) AS rn
            FROM homeworks h
            WHERE h.lesson_id IS NOT NULL
        )
        UPDATE homeworks
        SET lesson_id = NULL
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )
    op.create_index(
        "uq_homework_per_lesson",
        "homeworks",
        ["lesson_id"],
        unique=True,
        postgresql_where=sa.text("lesson_id IS NOT NULL"),
    )


def downgrade() -> None:
    # Uzilgan vazifalarni qaytarib bo'lmaydi: qaysi darsga tegishli bo'lgani
    # saqlanmagan. Faqat cheklov olib tashlanadi.
    op.drop_index("uq_homework_per_lesson", table_name="homeworks")
