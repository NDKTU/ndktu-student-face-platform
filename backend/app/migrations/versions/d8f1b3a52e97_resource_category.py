"""Kurs materiali toifasi: kutubxona kitobi yoki fan hujjati

Kurs darajasidagi fayllar endi ikki bo'limga bo'linadi: «Kutubxona»
(kitob, qo'llanma) va «Fan hujjatlari» (o'quv dastur, sillabus va h.k.).
Mavjud yozuvlar kutubxonada qoladi — `server_default` shu.

Revision ID: d8f1b3a52e97
Revises: c3e8a5f17b24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8f1b3a52e97"
down_revision: Union[str, Sequence[str], None] = "c3e8a5f17b24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "resources",
        sa.Column("category", sa.String(length=20), server_default="library", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("resources", "category")
