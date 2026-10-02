"""Oraliq nazorat: kurs testi va uning manba darslari

`quizzes.course_id` — test butun kursniki (bitta darsniki emas).
`quiz_lessons` — oraliq nazorat savollari olinadigan darslar.

Revision ID: e4a7c2b81f05
Revises: d3f8a2c6b915
Create Date: 2026-10-02 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4a7c2b81f05"
down_revision: Union[str, Sequence[str], None] = "d3f8a2c6b915"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("quizzes", sa.Column("course_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_quizzes_course_id"), "quizzes", ["course_id"], unique=False)
    op.create_foreign_key(
        "quizzes_course_id_fkey", "quizzes", "courses", ["course_id"], ["id"], ondelete="SET NULL"
    )

    op.create_table(
        "quiz_lessons",
        sa.Column("quiz_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("quiz_id", "lesson_id", name="uq_quiz_lesson"),
    )
    op.create_index(op.f("ix_quiz_lessons_quiz_id"), "quiz_lessons", ["quiz_id"], unique=False)
    op.create_index(op.f("ix_quiz_lessons_lesson_id"), "quiz_lessons", ["lesson_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_quiz_lessons_lesson_id"), table_name="quiz_lessons")
    op.drop_index(op.f("ix_quiz_lessons_quiz_id"), table_name="quiz_lessons")
    op.drop_table("quiz_lessons")
    op.drop_constraint("quizzes_course_id_fkey", "quizzes", type_="foreignkey")
    op.drop_index(op.f("ix_quizzes_course_id"), table_name="quizzes")
    op.drop_column("quizzes", "course_id")
