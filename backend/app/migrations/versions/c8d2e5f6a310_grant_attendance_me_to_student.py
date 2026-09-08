"""Talabaga o'z davomatini ko'rish huquqi

`attendance:me` — `read:attendance` dan alohida: ikkinchisi o'qituvchiniki va
u bilan birga boshqa talabalarning jurnali ham ochilib ketardi. Nomlash
`user:me` / `teacher:me` bilan bir xil.

Huquq qatori shu yerda yaratiladi: migratsiya qo'lda, huquq sinxronizatsiyasi
esa ilova yuklanganda ishlaydi — tartib teskari bo'lsa grant jimgina
o'tkazib yuborilardi.

Revision ID: c8d2e5f6a310
Revises: b7c1d4e5f209
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c8d2e5f6a310"
down_revision: Union[str, Sequence[str], None] = "b7c1d4e5f209"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERMISSION = "attendance:me"


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO permissions (name, created_at, updated_at)
        VALUES ('{PERMISSION}', now(), now())
        ON CONFLICT (name) DO NOTHING
        """
    )
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name = '{PERMISSION}'
        WHERE lower(r.name) = 'student'
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) = 'student'
          AND p.name = '{PERMISSION}'
        """
    )
