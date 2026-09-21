"""Test yig'ish ruxsatlari talabadan olib tashlandi

Talabaning testdagi ishi — uni ishlash: `read:active_quiz` faol testlar
ro'yxatini beradi, `quiz_process:*` esa boshlash, javob yuborish va
yakunlashni. Testni yig'ish o'qituvchi va ma'muriyat ishi.

Amalda esa `read:quiz` talaba roliga qo'lda berib yuborilgan edi — na
`c8a3f0d2e517` migratsiyasi (u `read:quiz` ni ataylab bermaydi), na
`core/lifespan/defaults.py` dagi `STUDENT_PERMISSIONS` unda yo'q. Natijada
talabaga butun universitetning «Testlar» sahifasi ochilardi, ustiga «Test
yaratish» tugmasi bilan.

Shuning uchun `read:quiz` va yonidagi yozuv ruxsatlari `student` rolidan
olib tashlanadi. Boshqa rollarga tegilmaydi. Seed ruxsat OLIB TASHLAMAYDI,
`STUDENT_PERMISSIONS` da bular yo'q — demak keyingi ishga tushishda
tiklanmaydi.

Migratsiya yagona chegara emas: ruxsat qo'lda qaytarilsa ham test yig'ish
endpointlari talabani kiritmaydi (`core/dependencies/role_checker.py` dagi
`PermissionRequiredExceptStudent`).

Revision ID: a4c7e2b91d05
Revises: b9d6f2a41c73
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a4c7e2b91d05"
down_revision: Union[str, Sequence[str], None] = "b9d6f2a41c73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STUDENT_QUIZ_AUTHORING = (
    "read:quiz",
    "create:quiz",
    "update:quiz",
    "delete:quiz",
)


def _names() -> str:
    return ", ".join(f"'{name}'" for name in STUDENT_QUIZ_AUTHORING)


def upgrade() -> None:
    op.execute(
        f"""
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) = 'student'
          AND p.name IN ({_names()})
        """
    )


def downgrade() -> None:
    """Faqat `read:quiz` qaytariladi — bazada aynan o'sha bor edi.

    Yozuv ruxsatlari talabaga hech qachon berilmagan, ular ro'yxatda
    faqat ehtiyot uchun turibdi; downgrade ularni «tiklab» qo'ysa, bu
    bo'lmagan holatni yaratgan bo'lardi.
    """
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name = 'read:quiz'
        WHERE lower(r.name) = 'student'
          AND NOT EXISTS (
              SELECT 1 FROM role_permissions rp
              WHERE rp.role_id = r.id AND rp.permission_id = p.id
          )
        """
    )
