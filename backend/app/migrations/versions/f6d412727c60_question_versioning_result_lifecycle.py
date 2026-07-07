"""question versioning/soft-delete fields + result lifecycle fields

Revision ID: f6d412727c60
Revises: bb44a2fc35d0
Create Date: 2026-07-05 15:40:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6d412727c60"
down_revision: Union[str, Sequence[str], None] = "bb44a2fc35d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- questions: correct_option + versioning + soft delete ---
    op.add_column("questions", sa.Column("correct_option", sa.String(length=1), server_default="a", nullable=False))
    op.add_column("questions", sa.Column("version", sa.Integer(), server_default="1", nullable=False))
    op.add_column("questions", sa.Column("is_latest", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("questions", sa.Column("original_question_id", sa.Integer(), nullable=True))
    op.add_column("questions", sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False))
    op.create_foreign_key(
        "fk_questions_original_question_id_questions",
        "questions",
        "questions",
        ["original_question_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- results: attempt lifecycle (status/finished_at, nullable grade fields) ---
    op.add_column("results", sa.Column("status", sa.String(length=20), server_default="in_progress", nullable=False))
    op.add_column("results", sa.Column("finished_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE results SET status = 'completed'")
    op.alter_column("results", "correct_answers", existing_type=sa.INTEGER(), nullable=True)
    op.alter_column("results", "wrong_answers", existing_type=sa.INTEGER(), nullable=True)
    op.alter_column("results", "grade", existing_type=sa.INTEGER(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("results", "grade", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column("results", "wrong_answers", existing_type=sa.INTEGER(), nullable=False)
    op.alter_column("results", "correct_answers", existing_type=sa.INTEGER(), nullable=False)
    op.drop_column("results", "finished_at")
    op.drop_column("results", "status")

    op.drop_constraint("fk_questions_original_question_id_questions", "questions", type_="foreignkey")
    op.drop_column("questions", "is_active")
    op.drop_column("questions", "original_question_id")
    op.drop_column("questions", "is_latest")
    op.drop_column("questions", "version")
    op.drop_column("questions", "correct_option")
