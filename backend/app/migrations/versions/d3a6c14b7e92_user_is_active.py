"""user_is_active

Флаг активности учётной записи.

Нужен из-за внешней аутентификации: при увольнении сотрудник перестаёт
проходить вход через Hemis, но локальная запись остаётся живой и с прежними
правами. Флаг закрывает вход независимо от способа входа — локального,
студенческого или сотруднического.

Все существующие записи получают ``true``: миграция никого не отключает.

Revision ID: d3a6c14b7e92
Revises: c2f5b83a1d46
Create Date: 2026-08-08 14:05:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3a6c14b7e92"
down_revision: Union[str, Sequence[str], None] = "c2f5b83a1d46"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "is_active")
