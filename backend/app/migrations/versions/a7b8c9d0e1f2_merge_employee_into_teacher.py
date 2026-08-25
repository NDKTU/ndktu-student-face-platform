"""merge employee into teacher

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-25

`employees` jadvali `teachers` ga birlashadi: xodim kartochkasi endi
o'qituvchi yozuvining o'zi. O'qituvchi profili bo'lmagan xodimlar
(`employees` da bor, `teachers` da yo'q) yo'qoladi — ularni saqlaydigan
joy qolmadi. Ishlab chiqarish bazasida bajarishdan oldin `make
backup-database`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Yangi ustunlar (avval nullable, ma'lumot ko'chgach NOT NULL)
    op.add_column("teachers", sa.Column("user_id", sa.Integer(), nullable=True))
    for col in ("last_name", "first_name", "third_name"):
        op.add_column("teachers", sa.Column(col, sa.String(255), nullable=True))
    op.add_column("teachers", sa.Column("full_name", sa.String(500), nullable=True))
    op.add_column("teachers", sa.Column("image_url", sa.String(255), nullable=True))
    op.add_column("teachers", sa.Column("hemis_id", sa.String(64), nullable=True))
    op.add_column("teachers", sa.Column("external_id", sa.String(64), nullable=True))
    op.add_column("teachers", sa.Column("external_source", sa.String(32), nullable=True))
    op.add_column("teachers", sa.Column("synced_at", sa.DateTime(), nullable=True))
    op.add_column("teachers", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")))

    # 2. Employees'dan ma'lumotni ko'chirish
    op.execute("""
        UPDATE teachers t SET
            user_id         = e.user_id,
            last_name       = e.last_name,
            first_name      = e.first_name,
            third_name      = e.third_name,
            full_name       = e.full_name,
            image_url       = e.image_url,
            hemis_id        = e.hemis_id,
            external_id     = e.external_id,
            external_source = e.external_source,
            synced_at       = e.synced_at,
            is_active       = e.is_active
        FROM employees e
        WHERE t.employee_id = e.id
    """)

    # 3. user_id topilmagan yetim qatorlar bo'lsa — o'chiramiz
    op.execute("DELETE FROM teachers WHERE user_id IS NULL")

    # 4. Cheklovlar
    op.alter_column("teachers", "user_id", nullable=False)
    for col in ("last_name", "first_name", "third_name", "full_name"):
        op.alter_column("teachers", col, nullable=False)
    op.create_unique_constraint("uq_teachers_user_id", "teachers", ["user_id"])
    op.create_foreign_key("fk_teachers_user_id", "teachers", "users", ["user_id"], ["id"])
    op.create_index("ix_teachers_full_name", "teachers", ["full_name"])
    op.execute("""
        CREATE UNIQUE INDEX uq_teachers_hemis_id ON teachers (hemis_id)
        WHERE hemis_id IS NOT NULL
    """)
    op.execute("""
        CREATE UNIQUE INDEX uq_teachers_external_ref ON teachers (external_source, external_id)
        WHERE external_id IS NOT NULL
    """)

    # 5. Eski bog'lanish va jadval
    op.drop_column("teachers", "employee_id")
    op.drop_table("employees")


def downgrade() -> None:
    raise NotImplementedError("Employee -> Teacher birlashuvi qaytarilmaydi: o'qituvchi bo'lmagan xodimlar yo'qoladi")
