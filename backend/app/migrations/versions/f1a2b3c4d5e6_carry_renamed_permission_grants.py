"""carry role grants across the renamed permissions

Ветка переименовала часть прав: ``*:assignment`` стали ``*:homework``,
``employee:me`` стал ``teacher:me``. Строки самих прав создаются на старте
приложения из обхода роутов (``sync_permissions``), а роли Admin права
доназначаются принудительно (``assign_admin_permissions``) — но у всех
остальных ролей записи ``role_permissions`` продолжают указывать на старые
имена. Без этой миграции преподавательская роль, у которой до деплоя был
доступ к ``/assignment/*`` и ``/employee/me``, после деплоя получает 403 на
``/homework/*`` и ``/teacher/me``.

Что делает: для каждой пары «старое имя -> новое имя» выдаёт новое право
каждой НЕ-админской роли, у которой есть старое.

Чего не делает:

* не трогает Admin — ему всё выдаёт старт приложения;
* не удаляет устаревшие права и выданные по ним гранты. Уборка осиротевших
  прав — отдельная задача, а удаление строк здесь только усложнило бы разбор
  миграции.

Идемпотентна: новое право создаётся, только если его ещё нет (на старте
приложения оно появится и само), грант вставляется, только если такой пары
ещё нет. ``DISTINCT`` страхует от дублей: уникальности на
``(role_id, permission_id)`` в схеме нет.

``downgrade`` снимает гранты на новые права у тех не-админских ролей, у
которых есть старое право; сами строки прав остаются на месте — их всё равно
заново создаёт старт приложения. Отличить грант, выданный этой миграцией, от
выданного вручную до неё, нельзя, поэтому откат снимет и такой — как и в
``c8a3f0d2e517``.

Revision ID: f1a2b3c4d5e6
Revises: b8c9d0e1f2a3
Create Date: 2026-08-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: (старое имя права, новое имя права)
RENAMED_PERMISSIONS: tuple[tuple[str, str], ...] = (
    ("create:assignment", "create:homework"),
    ("read:assignment", "read:homework"),
    ("update:assignment", "update:homework"),
    ("delete:assignment", "delete:homework"),
    ("employee:me", "teacher:me"),
)

_INSERT_PERMISSION = sa.text(
    """
    INSERT INTO permissions (name, created_at, updated_at)
    SELECT :new_name, now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = :new_name)
    """
)

_CARRY_GRANTS = sa.text(
    """
    INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
    SELECT DISTINCT rp.role_id, new_p.id, now(), now()
    FROM role_permissions rp
    JOIN permissions old_p ON old_p.id = rp.permission_id AND old_p.name = :old_name
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions new_p ON new_p.name = :new_name
    WHERE lower(r.name) <> 'admin'
    AND NOT EXISTS (
        SELECT 1 FROM role_permissions existing
        WHERE existing.role_id = rp.role_id AND existing.permission_id = new_p.id
    )
    """
)

_REVOKE_GRANTS = sa.text(
    """
    DELETE FROM role_permissions rp
    USING permissions new_p, roles r
    WHERE rp.permission_id = new_p.id
    AND new_p.name = :new_name
    AND r.id = rp.role_id
    AND lower(r.name) <> 'admin'
    AND EXISTS (
        SELECT 1 FROM role_permissions old_rp
        JOIN permissions old_p ON old_p.id = old_rp.permission_id
        WHERE old_rp.role_id = rp.role_id AND old_p.name = :old_name
    )
    """
)


def upgrade() -> None:
    for old_name, new_name in RENAMED_PERMISSIONS:
        op.execute(_INSERT_PERMISSION.bindparams(new_name=new_name))
        op.execute(_CARRY_GRANTS.bindparams(old_name=old_name, new_name=new_name))


def downgrade() -> None:
    for old_name, new_name in RENAMED_PERMISSIONS:
        op.execute(_REVOKE_GRANTS.bindparams(old_name=old_name, new_name=new_name))
