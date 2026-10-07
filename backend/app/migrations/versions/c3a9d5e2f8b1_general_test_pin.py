"""Elementar test: ixtiyoriy PIN

`general_tests.pin` — bo'sh bo'lsa test PIN'siz boshlanadi. PIN'ni server
yaratadi; mavjud testlar PIN'siz qoladi (avvalgidek ishlaydi).

Revision ID: c3a9d5e2f8b1
Revises: b8e4f1a7d2c9
Create Date: 2026-10-07 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3a9d5e2f8b1"
down_revision: Union[str, Sequence[str], None] = "b8e4f1a7d2c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("general_tests", sa.Column("pin", sa.String(length=16), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("general_tests", "pin")
