"""Elementar test: guruh bo'yicha yoqish/yashirish

Revision ID: b2c4e6a8d013
Revises: f1b3d5a7c902
Create Date: 2026-10-02 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c4e6a8d013"
down_revision: Union[str, Sequence[str], None] = "f1b3d5a7c902"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Mavjud biriktirmalar faol bo'lib qoladi — hozir ular ko'rinib turibdi.
    op.add_column(
        "general_test_groups",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("general_test_groups", "is_active")
