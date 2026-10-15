"""Uy vazifasi: rad etish va qayta topshirish

`homework_submissions.attempts` — avvalgi urinishlar (javob, baho, izoh).
O'qituvchi ishni rad etsa (`rejected`) yoki past baho uchun qaytarsa
(`returned`), talaba yangi javob yuborganda eskisi shu yerga ko'chadi.

Revision ID: d2a8f6c4e1b9
Revises: c7e3b9a1d5f2
Create Date: 2026-10-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d2a8f6c4e1b9"
down_revision: Union[str, Sequence[str], None] = "c7e3b9a1d5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "homework_submissions",
        sa.Column(
            "attempts",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("homework_submissions", "attempts")
