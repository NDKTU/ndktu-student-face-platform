"""Kurs yaratish va tahrirlash o'qituvchidan olib tashlandi

Kurs — ma'muriyat obyekti: uni o'quv reja bo'yicha administratsiya tuzadi,
EPOS prognozi esa avtomatik yaratadi. O'qituvchining «Tahrirlash» oynasi
boshqa o'qituvchini tanlashga ham imkon berardi, ya'ni kursni o'zidan
o'tkazib yuborish yoki begona kursni o'ziga olish mumkin edi.

Shuning uchun `create:course` va `update:course` `teacher` rolidan
olib tashlanadi. `read:course` qoladi — o'qituvchi o'z kurslarini ko'radi,
darslari, uy vazifalari va baholari hammasi o'sha joyda.

`update:course` kursga assistent qo'shishni ham qo'riqlaydi
(`POST/DELETE /course/{id}/teachers`), lekin u interfeysdan chaqirilmaydi:
assistent bilan ishlash ham ma'muriyatda qoladi.

Faqat grantlar o'chiriladi — ruxsatlarning o'zi route'lardan topiladi va
ishga tushganda admin roliga qayta beriladi. `defaults.py` dagi
`TEACHER_PERMISSIONS` ro'yxatida bu ikkisi yo'q, shuning uchun keyingi
ishga tushishda tiklanmaydi.

Revision ID: e7b3a1c92d68
Revises: f2a9d4c7b1e3
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e7b3a1c92d68"
down_revision: Union[str, Sequence[str], None] = "f2a9d4c7b1e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TEACHER_COURSE_WRITE = ("create:course", "update:course")


def _names() -> str:
    return ", ".join(f"'{name}'" for name in TEACHER_COURSE_WRITE)


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
