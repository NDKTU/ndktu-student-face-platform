"""Test: matnni yashirish

`quizzes.hold_to_reveal`, `general_tests.hold_to_reveal` — savol matni faqat
«ko'rish» tugmasi bosilib turganda ko'rinadi. Mavjud testlarda o'chiq.

Revision ID: f3c7d1a8b4e2
Revises: e8b2c5f1a9d6
Create Date: 2026-10-08 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3c7d1a8b4e2"
down_revision: Union[str, Sequence[str], None] = "e8b2c5f1a9d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    for table in ("quizzes", "general_tests"):
        op.add_column(
            table,
            sa.Column("hold_to_reveal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )


def downgrade() -> None:
    """Downgrade schema."""
    for table in ("general_tests", "quizzes"):
        op.drop_column(table, "hold_to_reveal")
