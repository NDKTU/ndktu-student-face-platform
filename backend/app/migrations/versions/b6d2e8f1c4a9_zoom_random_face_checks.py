"""Zoom seansi: yuz nazorati faqat kirishda yoki dars davomida ham

`zoom_sessions.random_face_checks` — `true` (avvalgi xatti-harakat): kirishda
va dars davomida tasodifiy tekshiriladi; `false` — faqat kirishda. Mavjud
seanslar o'zgarmaydi.

Revision ID: b6d2e8f1c4a9
Revises: a8c4e2f7b1d3
Create Date: 2026-10-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6d2e8f1c4a9"
down_revision: Union[str, Sequence[str], None] = "a8c4e2f7b1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "zoom_sessions",
        sa.Column("random_face_checks", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("zoom_sessions", "random_face_checks")
