"""EduPlan service-account credentials managed from the admin UI.

Revision ID: f4c1d2e3a5b6
Revises: c3e8b7f12a64
Create Date: 2026-08-21 18:40:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f4c1d2e3a5b6"
down_revision: Union[str, Sequence[str], None] = "c3e8b7f12a64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "eduplan_credentials" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "eduplan_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("base_url", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=150), nullable=False),
        sa.Column("password_encrypted", sa.Text(), nullable=False),
        sa.Column("active_role", sa.String(length=50), nullable=False, server_default=""),
        sa.Column(
            "updated_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("eduplan_credentials")
