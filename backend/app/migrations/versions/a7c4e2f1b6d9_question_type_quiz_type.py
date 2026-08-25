"""question_type va quiz_type ustunlari

Revision ID: a7c4e2f1b6d9
Revises: f4c1d2e3a5b6
Create Date: 2026-08-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c4e2f1b6d9"
down_revision: Union[str, Sequence[str], None] = "f4c1d2e3a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column("question_type", sa.String(32), nullable=False, server_default="QUIZ"),
    )
    op.add_column(
        "quizzes",
        sa.Column("quiz_type", sa.String(32), nullable=False, server_default="LESSON_QUIZ"),
    )


def downgrade() -> None:
    op.drop_column("quizzes", "quiz_type")
    op.drop_column("questions", "question_type")
