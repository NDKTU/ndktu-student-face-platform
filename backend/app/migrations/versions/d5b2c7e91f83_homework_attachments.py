"""homeworks.attachments — o'qituvchi biriktirgan fayllar

Vazifaga shart, namuna yoki tarqatma material qo'shishning yo'li yo'q edi:
modelda faqat ``allow_file`` bor, u esa aksincha — talaba fayl yubora
oladimi, degani.

Ro'yxat ``[{name, url, size, type}]`` ko'rinishida saqlanadi — topshiriq
fayllari bilan bir xil shakl, shuning uchun frontendda ham bitta komponent
ishlaydi.

Revision ID: d5b2c7e91f83
Revises: c7e1a9d4b283
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d5b2c7e91f83"
down_revision: Union[str, Sequence[str], None] = "c7e1a9d4b283"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "homeworks",
        sa.Column(
            "attachments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("homeworks", "attachments")
