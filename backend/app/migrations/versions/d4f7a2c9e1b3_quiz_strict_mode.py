"""Test: qat'iy rejim

`quizzes.strict_mode` — talaba sahifadan chiqsa, boshqa ilovani ochsa yoki
ekranni bo'lsa, urinish serverda yopiladi. Mavjud testlarda o'chiq.

Revision ID: d4f7a2c9e1b3
Revises: c3a9d5e2f8b1
Create Date: 2026-10-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4f7a2c9e1b3"
down_revision: Union[str, Sequence[str], None] = "c3a9d5e2f8b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "quizzes",
        sa.Column("strict_mode", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("quizzes", "strict_mode")
