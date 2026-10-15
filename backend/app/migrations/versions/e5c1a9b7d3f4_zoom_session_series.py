"""Zoom seanslari seriyasi

`zoom_sessions.series_id` — har hafta / har 2 haftada takrorlanadigan
seanslar bir martada yaratilganda bir xil. «Shu va keyingilari»ni
o'zgartirish va o'chirish shu kalit bo'yicha.

Revision ID: e5c1a9b7d3f4
Revises: d2a8f6c4e1b9
Create Date: 2026-10-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5c1a9b7d3f4"
down_revision: Union[str, Sequence[str], None] = "d2a8f6c4e1b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("zoom_sessions", sa.Column("series_id", sa.String(length=32), nullable=True))
    op.create_index(op.f("ix_zoom_sessions_series_id"), "zoom_sessions", ["series_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_zoom_sessions_series_id"), table_name="zoom_sessions")
    op.drop_column("zoom_sessions", "series_id")
