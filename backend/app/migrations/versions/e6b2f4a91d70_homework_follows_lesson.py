"""Dars o'chirilsa, uy vazifasi ham o'chsin

Ilgari `homeworks.lesson_id` ON DELETE SET NULL edi: dars o'chirilganda
vazifa qolib ketardi va «Uy vazifalari» ro'yxatida darsi yo'q, egasi
noma'lum yozuvlar to'planardi.

Endi CASCADE: vazifa o'z darsi bilan birga ketadi. Kurs darajasidagi
(darsga bog'lanmagan) vazifalarga bu ta'sir qilmaydi — ular `lesson_id`
NULL bilan yashaydi.

Mavjud «etim» yozuvlar o'chirilmaydi: ular orasida ataylab kurs
darajasida yaratilganlari ham bo'lishi mumkin, ularni ajratib bo'lmaydi.
Keraksizlarini foydalanuvchi ro'yxatdan o'zi o'chiradi.

Revision ID: e6b2f4a91d70
Revises: d4f7a91c26b3
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e6b2f4a91d70"
down_revision: Union[str, Sequence[str], None] = "d4f7a91c26b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FK = "homeworks_lesson_id_fkey"


def upgrade() -> None:
    op.drop_constraint(_FK, "homeworks", type_="foreignkey")
    op.create_foreign_key(_FK, "homeworks", "lessons", ["lesson_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint(_FK, "homeworks", type_="foreignkey")
    op.create_foreign_key(_FK, "homeworks", "lessons", ["lesson_id"], ["id"], ondelete="SET NULL")
