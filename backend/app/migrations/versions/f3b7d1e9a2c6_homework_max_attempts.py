"""Uy vazifasi: urinishlar soni, rad etish olib tashlandi

`homeworks.max_attempts` — talaba javobni necha marta yuborishi mumkin
(birinchi javob ham urinish). Mavjud vazifalarga 2: avvalgidek bir marta
qaytarish mumkin bo'lib qoladi.

`rejected` holati endi yo'q — o'qituvchi baholanmagan ishni ham
«Qayta topshirishga qaytarish» bilan qaytaradi. Rad etilgan ishlar bahosiz
`returned` ga o'tadi: ma'nosi bir xil, ish talabada.

Revision ID: f3b7d1e9a2c6
Revises: e5c1a9b7d3f4
Create Date: 2026-10-15 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3b7d1e9a2c6"
down_revision: Union[str, Sequence[str], None] = "e5c1a9b7d3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "homeworks",
        sa.Column("max_attempts", sa.Integer(), server_default=sa.text("2"), nullable=False),
    )
    op.execute("UPDATE homework_submissions SET status = 'returned' WHERE status = 'rejected'")
    # Tarixdagi urinishlar ham — aks holda «Avvalgi urinishlar» da noma'lum holat qoladi.
    op.execute(
        """
        UPDATE homework_submissions
        SET attempts = (
            SELECT jsonb_agg(
                CASE WHEN e->>'status' = 'rejected' THEN jsonb_set(e, '{status}', '"returned"') ELSE e END
                ORDER BY ord
            )
            FROM jsonb_array_elements(attempts) WITH ORDINALITY AS t(e, ord)
        )
        WHERE attempts @> '[{"status": "rejected"}]'
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("homeworks", "max_attempts")
