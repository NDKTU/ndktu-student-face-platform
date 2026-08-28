"""Kurs modulini rollarga ochish: talaba ko'radi, o'qituvchi vazifa beradi

Kurs, dars va uy vazifasi huquqlari `student` va `teacher` rollariga
berilmagan edi — talaba «Kurslar» bo'limini umuman ko'rmasdi, o'qituvchi
esa kursga kira olmasdi va vazifa yarata olmasdi.

Sabab a7d3e9c21f40 dagi bilan bir xil: o'sha migratsiya `read:course` ni
beradi, lekin u ishga tushganda bu rollar hali mavjud emas edi (ular
tiklash paytida yaratilgan). Bu yerda to'liq to'plam beriladi.

Nima uchun aynan shu huquqlar:
* talabaga — faqat ko'rish va o'z ishini topshirish;
* o'qituvchiga — vazifa yaratish va topshiriqni baholash
  (`update:submission`), lekin kursning o'zini o'chirish emas.

Idempotent va rol yo'q bo'lsa hech narsa qilmaydi.

Revision ID: e2a4f8c15d97
Revises: d5b2c7e91f83
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e2a4f8c15d97"
down_revision: Union[str, Sequence[str], None] = "d5b2c7e91f83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STUDENT_PERMISSIONS = (
    "read:course",
    "read:lesson",
    "read:resource",
    "read:homework",
    "create:submission",
    "read:submission",
)

TEACHER_PERMISSIONS = (
    "read:course",
    "read:homework",
    "create:homework",
    "update:homework",
    "delete:homework",
    "read:submission",
    "update:submission",
)


def _grant(role: str, permissions: tuple[str, ...]) -> None:
    names = ", ".join(f"'{name}'" for name in permissions)
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name IN ({names})
        WHERE lower(r.name) = '{role}'
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
        """
    )


def _revoke(role: str, permissions: tuple[str, ...]) -> None:
    names = ", ".join(f"'{name}'" for name in permissions)
    op.execute(
        f"""
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) = '{role}'
          AND p.name IN ({names})
        """
    )


def upgrade() -> None:
    _grant("student", STUDENT_PERMISSIONS)
    _grant("teacher", TEACHER_PERMISSIONS)


def downgrade() -> None:
    _revoke("student", STUDENT_PERMISSIONS)
    _revoke("teacher", TEACHER_PERMISSIONS)
