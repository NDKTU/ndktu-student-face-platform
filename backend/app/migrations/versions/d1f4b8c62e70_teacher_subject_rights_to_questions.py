"""Oʻqituvchidan elementar FAN huquqlari olinib, SAVOL huquqlari berildi

Qaror: fan — maʼmuriyat obyekti. Oʻqituvchi uni koʻradi, lekin
yaratmaydi, nomini oʻzgartirmaydi va oʻchirmaydi. Uning ishi fan
ichida: savollar banki va testlar.

Buni oddiy olib tashlash bilan qilib boʻlmasdi. `update:general_test_subject`
bitta huquq ostida ikki xil ishni yopib turardi:

* fanning oʻzini tahrirlash va unga foydalanuvchi biriktirish;
* savol qoʻshish, Excel yuklash, rasm yuklash, savolni tahrirlash.

Yaʼni savol yuklashga ruxsat berish fanni tahrirlashga ham ruxsat
berardi. Shuning uchun savollar banki alohida huquqlarga ajratildi
(`create/update/delete:general_test_question`), va faqat shundan
keyin fan huquqlarini olib tashlash mumkin boʻldi.

Seed huquq OLIB TASHLAMAYDI (`core/lifespan/assignment.py`), shuning
uchun ishlab turgan bazada ular faqat shu migratsiya bilan ketadi.
Yangi huquqlar esa roʻyxatda bor — ular keyingi ishga tushishda
oʻzi beriladi.

Revision ID: d1f4b8c62e70
Revises: c3d5e7f9a124
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d1f4b8c62e70"
down_revision: Union[str, Sequence[str], None] = "c3d5e7f9a124"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: Fanning oʻzi — maʼmuriyatda qoladi.
SUBJECT_RIGHTS = (
    "create:general_test_subject",
    "update:general_test_subject",
    "delete:general_test_subject",
)

#: Savollar banki — oʻqituvchida.
QUESTION_RIGHTS = (
    "create:general_test_question",
    "update:general_test_question",
    "delete:general_test_question",
)


def _names(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{name}'" for name in values)


def _grant(names: tuple[str, ...]) -> None:
    """Huquqlarni yaratadi va `teacher` roliga bogʻlaydi.

    Huquq satrini shu yerda yaratamiz: `discovery.py` uni marshrutlardan
    topib qoʻshadi, lekin bu ishga tushishda boʻladi — migratsiya esa
    undan OLDIN oʻtadi va aks holda bogʻlanadigan narsa topilmasdi.
    """
    op.execute(
        f"""
        INSERT INTO permissions (name, created_at, updated_at)
        SELECT n, now(), now()
        FROM unnest(ARRAY[{_names(names)}]) AS n
        WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = n)
        """
    )
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name IN ({_names(names)})
        WHERE lower(r.name) IN ('teacher', 'admin')
          AND NOT EXISTS (
              SELECT 1 FROM role_permissions rp
              WHERE rp.role_id = r.id AND rp.permission_id = p.id
          )
        """
    )


def _revoke(names: tuple[str, ...]) -> None:
    op.execute(
        f"""
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) = 'teacher'
          AND p.name IN ({_names(names)})
        """
    )


def upgrade() -> None:
    # Avval berib, keyin olib tashlaymiz: teskari tartibda oʻqituvchi
    # migratsiya oʻrtasida savol yuklay olmaydigan holatga tushardi.
    _grant(QUESTION_RIGHTS)
    _revoke(SUBJECT_RIGHTS)


def downgrade() -> None:
    _grant(SUBJECT_RIGHTS)
    _revoke(QUESTION_RIGHTS)
