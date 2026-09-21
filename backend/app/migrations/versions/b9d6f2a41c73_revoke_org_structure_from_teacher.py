"""Tashkiliy tuzilma spravochniklari o'qituvchidan olib tashlandi

Fakultetlar, kafedralar, mutaxassisliklar va o'quv rejalar — ma'muriyat
ma'lumotnomasi: ularni EPOS/HEMIS to'ldiradi, platformada esa faqat
o'qiladi. O'qituvchining kundalik ishida butun universitetning bo'linmalari
kerak emas — uning guruhlari, kurslari, darslari va baholari o'z
bo'limlarida. Menyuda esa «Tashkiliy tuzilma» to'rt bandli guruh bo'lib
ko'zga tashlanib turardi.

Shuning uchun `read:faculty`, `read:kafedra`, `read:speciality` va
`read:curriculum` `teacher` rolidan olib tashlanadi. Boshqa rollarga
tegilmaydi: psixolog natijalarni fakultet bo'yicha filtrlaydi, tyutor esa
guruhlarni bo'linma kesimida ko'radi.

Faqat grantlar o'chiriladi — ruxsatlarning o'zi route'lardan topiladi va
ishga tushganda admin roliga qayta beriladi. `defaults.py` dagi
`TEACHER_PERMISSIONS` ro'yxatida bu to'rttasi yo'q, shuning uchun keyingi
ishga tushishda tiklanmaydi.

Migratsiya yagona chegara emas: ruxsat qo'lda qaytarilsa ham endpointlar
o'qituvchini kiritmaydi (`core/dependencies/role_checker.py` dagi
`PermissionRequiredExceptTeacher`).

Revision ID: b9d6f2a41c73
Revises: e7b3a1c92d68
"""

from typing import Sequence, Union

from alembic import op

revision: str = "b9d6f2a41c73"
down_revision: Union[str, Sequence[str], None] = "e7b3a1c92d68"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TEACHER_ORG_STRUCTURE_READ = (
    "read:faculty",
    "read:kafedra",
    "read:speciality",
    "read:curriculum",
)


def _names() -> str:
    return ", ".join(f"'{name}'" for name in TEACHER_ORG_STRUCTURE_READ)


def upgrade() -> None:
    op.execute(
        f"""
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) = 'teacher'
          AND p.name IN ({_names()})
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name IN ({_names()})
        WHERE lower(r.name) = 'teacher'
          AND NOT EXISTS (
              SELECT 1 FROM role_permissions rp
              WHERE rp.role_id = r.id AND rp.permission_id = p.id
          )
        """
    )
