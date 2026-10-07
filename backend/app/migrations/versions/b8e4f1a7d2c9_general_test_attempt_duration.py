"""Elementar test: urinishning o'z davomiyligi

`general_test_attempts.duration` — boshlanganda qotiriladi. Muddat endi
undan hisoblanadi: testning davomiyligi imtihon paytida o'zgartirilsa, ketayotgan
urinishlar jimgina uzilmaydi (yoki cho'zilmaydi).

Mavjud urinishlarga testning hozirgi davomiyligi yoziladi — ular shu
qiymat bilan hisoblanib kelgan.

Revision ID: b8e4f1a7d2c9
Revises: a6d3e9f2c1b7
Create Date: 2026-10-07 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8e4f1a7d2c9"
down_revision: Union[str, Sequence[str], None] = "a6d3e9f2c1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("general_test_attempts", sa.Column("duration", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE general_test_attempts a
        SET duration = t.duration
        FROM general_tests t
        WHERE t.id = a.test_id
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("general_test_attempts", "duration")
