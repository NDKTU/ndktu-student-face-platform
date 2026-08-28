"""Ochiq testda mehmon ishtirokchi

`results.guest_name` — tizimda hisobi yo'q ishtirokchining ismi. Ochiq test
(`quiz_type = PUBLIC_FREE`) havola va PIN orqali yechiladi, urinishda esa
`user_id` bo'sh qoladi va kim yechgani boshqa hech qayerda saqlanmasdi.

Revision ID: c7f1a94b28e5
Revises: b5e8c2a70d94
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7f1a94b28e5"
down_revision: Union[str, Sequence[str], None] = "b5e8c2a70d94"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("results", sa.Column("guest_name", sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column("results", "guest_name")
