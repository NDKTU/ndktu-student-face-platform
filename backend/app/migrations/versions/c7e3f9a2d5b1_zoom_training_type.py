"""Zoom seansi: mashg'ulot turi (ma'ruza / amaliyot / tajriba / seminar)

`zoom_sessions.training_type` — kurslardagi `courses.course_type` bilan bir
xil qiymatlar. Ixtiyoriy: avval yaratilgan seanslarda bo'sh qoladi.

Revision ID: c7e3f9a2d5b1
Revises: b6d2e8f1c4a9
Create Date: 2026-10-17 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7e3f9a2d5b1"
down_revision: Union[str, Sequence[str], None] = "b6d2e8f1c4a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("zoom_sessions", sa.Column("training_type", sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("zoom_sessions", "training_type")
