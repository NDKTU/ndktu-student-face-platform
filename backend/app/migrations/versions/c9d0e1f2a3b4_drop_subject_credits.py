"""drop subject credits

Revision ID: c9d0e1f2a3b4
Revises: a7c4e2f1b6d9
Create Date: 2026-08-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "a7c4e2f1b6d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("subjects", "credits")


def downgrade() -> None:
    op.add_column("subjects", sa.Column("credits", sa.Integer(), nullable=True))
