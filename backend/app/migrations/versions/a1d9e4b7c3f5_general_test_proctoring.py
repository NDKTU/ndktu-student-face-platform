"""Elementar test: yuz nazorati

`general_tests.proctoring_mode` — `standard` / `face` / `face_entry`, oddiy
testdagi kabi; `general_test_attempts.cheating_image_url` — kamera
nazoratida qoidabuzarlik kadri. Mavjud testlar kamerasiz qoladi.

Revision ID: a1d9e4b7c3f5
Revises: f3c7d1a8b4e2
Create Date: 2026-10-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1d9e4b7c3f5"
down_revision: Union[str, Sequence[str], None] = "f3c7d1a8b4e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "general_tests",
        sa.Column("proctoring_mode", sa.String(length=16), nullable=False, server_default="standard"),
    )
    op.add_column("general_test_attempts", sa.Column("cheating_image_url", sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("general_test_attempts", "cheating_image_url")
    op.drop_column("general_tests", "proctoring_mode")
