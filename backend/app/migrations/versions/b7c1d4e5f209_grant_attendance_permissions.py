"""Davomat huquqlarini o'qituvchi roliga berish

`read:attendance` va `mark:attendance` huquqlari routlardan avtomatik
topiladi (`core/lifespan/discovery.py`) va Admin ularni har yuklanishda oladi.
O'qituvchi esa olmaydi — rollarga huquq berish migratsiyalar ishi
(e2a4f8c15d97 dagi bilan bir xil naqsh).

Huquq qatorlarining o'zi ham shu yerda yaratiladi. Sabab tartibda: migratsiya
qo'lda, huquq sinxronizatsiyasi esa ilova yuklanganda ishlaydi. Migratsiya
bekend qayta ishga tushishidan oldin bajarilsa, JOIN hech narsa topmasdi va
grant jimgina o'tkazib yuborilardi — keyin sababini topish qiyin.

Talabaga hozircha berilmaydi: o'z davomatini ko'rish endpoint'i keyingi
bosqichda, u paydo bo'lgach alohida migratsiya bilan ochiladi. Yo'q
funksiyaga huquq berish — keyin sababi topilmaydigan qator.

Idempotent: huquq yoki rol yo'q bo'lsa hech narsa qilmaydi.

Revision ID: b7c1d4e5f209
Revises: 3a783861a927
"""

from typing import Sequence, Union

from alembic import op

revision: str = "b7c1d4e5f209"
down_revision: Union[str, Sequence[str], None] = "3a783861a927"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TEACHER_PERMISSIONS = (
    "read:attendance",
    "mark:attendance",
)


def upgrade() -> None:
    names = ", ".join(f"'{name}'" for name in TEACHER_PERMISSIONS)
    op.execute(
        f"""
        INSERT INTO permissions (name, created_at, updated_at)
        SELECT name, now(), now()
        FROM (VALUES {", ".join(f"('{name}')" for name in TEACHER_PERMISSIONS)}) AS v(name)
        ON CONFLICT (name) DO NOTHING
        """
    )
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name IN ({names})
        WHERE lower(r.name) = 'teacher'
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
        """
    )


def downgrade() -> None:
    names = ", ".join(f"'{name}'" for name in TEACHER_PERMISSIONS)
    op.execute(
        f"""
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) = 'teacher'
          AND p.name IN ({names})
        """
    )
