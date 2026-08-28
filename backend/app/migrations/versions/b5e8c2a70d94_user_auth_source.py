"""Foydalanuvchi paroli qayerda tekshirilishi

`users.auth_source` = `eduplan` bo'lsa, parolning haqiqat manbai EPOS.
Ilgari mahalliy xesh birinchi tekshirilardi va o'qituvchi EPOS'da parolini
almashtirgach ham eski parol bizda ishlayverardi.

Mavjud yozuvlar to'ldiriladi: EPOS'dan kelgan o'qituvchilar
(`teachers.external_source = 'eduplan'`) `eduplan` deb belgilanadi.

Revision ID: b5e8c2a70d94
Revises: a2d9e7f41c63
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b5e8c2a70d94"
down_revision: Union[str, Sequence[str], None] = "a2d9e7f41c63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("auth_source", sa.String(length=20), nullable=True))
    op.execute(
        """
        UPDATE users u
        SET auth_source = 'eduplan'
        FROM teachers t
        WHERE t.user_id = u.id AND t.external_source = 'eduplan'
        """
    )


def downgrade() -> None:
    op.drop_column("users", "auth_source")
