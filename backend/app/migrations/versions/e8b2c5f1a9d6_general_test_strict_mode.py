"""Elementar test: qat'iy rejim

`general_tests.strict_mode` — sahifadan chiqqan talabaning urinishi yopiladi;
`general_test_attempts.stop_reason` — nima uchun yopilgani (o'qituvchi uchun).

Revision ID: e8b2c5f1a9d6
Revises: d4f7a2c9e1b3
Create Date: 2026-10-08 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e8b2c5f1a9d6"
down_revision: Union[str, Sequence[str], None] = "d4f7a2c9e1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "general_tests",
        sa.Column("strict_mode", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("general_test_attempts", sa.Column("stop_reason", sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("general_test_attempts", "stop_reason")
    op.drop_column("general_tests", "strict_mode")
