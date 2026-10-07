"""Elementar savollar bankini koʻrish alohida huquq: `read:general_test_question`

Savollar banki `create/update/delete:general_test_question` bilan
fandan ajratilgan edi, lekin roʻyxatni koʻrish hali ham fan huquqi
(`read:general_test_subject`) ostida qolgandi. Endi toʻrtta amal ham
savolning oʻz huquqlarida.

Huquq `read:general_test_subject` ga ega HAR BIR rolga beriladi, faqat
`teacher`/`admin` ga emas: aks holda qoʻlda tuzilgan rol (masalan,
fanga biriktirilgan xodimniki) migratsiyadan keyin bankni koʻrmay
qolardi. Kim nima koʻrishini keyin admin oʻzi toraytiradi.

Revision ID: e5b2d9a7c381
Revises: d1f4b8c62e70
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e5b2d9a7c381"
down_revision: Union[str, Sequence[str], None] = "d1f4b8c62e70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERMISSION = "read:general_test_question"
SOURCE = "read:general_test_subject"


def upgrade() -> None:
    # Huquq satrini shu yerda yaratamiz: `discovery.py` uni marshrutlardan
    # ishga tushishda topadi, migratsiya esa undan OLDIN oʻtadi.
    op.execute(
        f"""
        INSERT INTO permissions (name, created_at, updated_at)
        SELECT '{PERMISSION}', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = '{PERMISSION}')
        """
    )
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT rp.role_id, target.id, now(), now()
        FROM role_permissions rp
        JOIN permissions source ON source.id = rp.permission_id AND source.name = '{SOURCE}'
        CROSS JOIN permissions target
        WHERE target.name = '{PERMISSION}'
          AND NOT EXISTS (
              SELECT 1 FROM role_permissions existing
              WHERE existing.role_id = rp.role_id AND existing.permission_id = target.id
          )
        """
    )


def downgrade() -> None:
    # `role_permissions.permission_id` — ON DELETE CASCADE.
    op.execute(f"DELETE FROM permissions WHERE name = '{PERMISSION}'")
