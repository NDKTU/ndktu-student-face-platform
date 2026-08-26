"""drop lesson_results table

Revision ID: e178ec7b42da
Revises: d0e1f2a3b4c5
Create Date: 2026-08-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e178ec7b42da"
down_revision: Union[str, Sequence[str], None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("lesson_results")


def downgrade() -> None:
    op.create_table(
        "lesson_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attendance", sa.String(16), nullable=False),
        sa.Column("grade", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            onupdate=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("lesson_id", "user_id", name="uq_lesson_result_per_user"),
    )
    op.create_index(op.f("ix_lesson_results_lesson_id"), "lesson_results", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_lesson_results_user_id"), "lesson_results", ["user_id"], unique=False)
