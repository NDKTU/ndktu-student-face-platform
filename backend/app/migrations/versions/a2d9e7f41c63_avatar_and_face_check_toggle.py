"""Profil surati va dars uchun yuz nazorati kaliti

Ikkita ustun:

- `users.avatar_path` — foydalanuvchi o'zi yuklaydigan surat. HEMIS'dagi
  talaba surati eskirgan bo'lishi mumkin, shuning uchun yuz nazoratida
  etalon sifatida avval shu surat qaraladi.
- `lessons.face_check_enabled` — jonli darsda yuz nazoratini o'qituvchi
  o'zi yoqadi. Standart holat — o'chiq: kamera talab qilish talabaga yuk,
  va bu har bir darsga kerak emas.

Revision ID: a2d9e7f41c63
Revises: f8c3d5b62a41
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2d9e7f41c63"
down_revision: Union[str, Sequence[str], None] = "f8c3d5b62a41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_path", sa.String(length=500), nullable=True))
    op.add_column(
        "lessons",
        sa.Column("face_check_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("lessons", "face_check_enabled")
    op.drop_column("users", "avatar_path")
