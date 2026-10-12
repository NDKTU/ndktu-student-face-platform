"""Yuz ko'rinmasa testni yakunlash

`quizzes.no_face_finish_seconds` va `general_tests.no_face_finish_seconds`:
kadrda yuz shuncha soniya ko'rinmasa test yakunlanadi; `NULL` — o'chiq.

Revision ID: a4d7e2c9f1b3
Revises: f2c6a8e4b1d7
Create Date: 2026-10-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a4d7e2c9f1b3"
down_revision: Union[str, Sequence[str], None] = "f2c6a8e4b1d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("quizzes", sa.Column("no_face_finish_seconds", sa.Integer(), nullable=True))
    op.add_column("general_tests", sa.Column("no_face_finish_seconds", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("general_tests", "no_face_finish_seconds")
    op.drop_column("quizzes", "no_face_finish_seconds")
