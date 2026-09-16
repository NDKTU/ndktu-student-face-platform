"""subject curriculum link

EPMOS bitta fanni har bir o'quv reja uchun alohida yozuv qilib beradi:
«Akademik yozuv» to'rt marta (dasturiy injiniring / sun'iy intellekt ×
kunduzgi / masofaviy). Kafedra ularni ajratmaydi — to'rtoviniki ham bitta,
shuning uchun ro'yxatlarda ular bir xil ko'rinardi va qaysi birini tanlash
kerakligi bilinmasdi. `edu_plan_id` EPMOS javobida bor edi, biz uni
o'qimasdan tashlab yuborardik (`_Lenient` — `extra="ignore"`).

`credits` ataylab qaytarilmaydi: u c9d0e1f2a3b4 da olib tashlangan va farqni
ajratishga hissa qo'shmaydi.

Revision ID: d4b7c1e93a2f
Revises: e7c4b2a91f58
Create Date: 2026-09-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4b7c1e93a2f"
down_revision: Union[str, Sequence[str], None] = "e7c4b2a91f58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("subjects", sa.Column("curriculum_id", sa.Integer(), nullable=True))
    op.add_column("subjects", sa.Column("semester", sa.String(length=32), nullable=True))
    op.create_index("ix_subjects_curriculum_id", "subjects", ["curriculum_id"])
    op.create_foreign_key(
        "subjects_curriculum_id_fkey",
        "subjects",
        "curriculums",
        ["curriculum_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("subjects_curriculum_id_fkey", "subjects", type_="foreignkey")
    op.drop_index("ix_subjects_curriculum_id", table_name="subjects")
    op.drop_column("subjects", "semester")
    op.drop_column("subjects", "curriculum_id")
