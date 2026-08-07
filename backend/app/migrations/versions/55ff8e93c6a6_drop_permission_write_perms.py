"""drop permission write perms

Revision ID: 55ff8e93c6a6
Revises: d47a1c6e2f80
Create Date: 2026-08-07 08:14:15.893791

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55ff8e93c6a6'
down_revision: Union[str, Sequence[str], None] = 'd47a1c6e2f80'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Убирает права трёх удалённых роутов Permission API.

    Роутов больше нет, значит `discover_permissions` эти имена не найдёт и они
    первыми попадут в список сирот, ради которого затевался лог в
    `sync_permissions`. Привязки в `role_permissions` уходят каскадом.
    """
    op.execute(
        "DELETE FROM permissions "
        "WHERE name IN ('create:permission', 'update:permission', 'delete:permission')"
    )


def downgrade() -> None:
    """Пустой намеренно.

    Если роуты вернут, права воссоздаст `discover_permissions` при старте. А вот
    привязки к ролям восстанавливать неоткуда — они были удалены каскадом.
    """
