"""rename assignment to homework

Revision ID: e5f6a7b8c9d0
Revises: e178ec7b42da
Create Date: 2026-08-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "e178ec7b42da"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("assignments", "homeworks")
    op.rename_table("assignment_submissions", "homework_submissions")
    op.alter_column("homework_submissions", "assignment_id", new_column_name="homework_id")

    # Sequences
    op.execute("ALTER SEQUENCE assignments_id_seq RENAME TO homeworks_id_seq")
    op.execute("ALTER SEQUENCE assignment_submissions_id_seq RENAME TO homework_submissions_id_seq")

    # Primary keys
    op.execute("ALTER INDEX assignments_pkey RENAME TO homeworks_pkey")
    op.execute("ALTER INDEX assignment_submissions_pkey RENAME TO homework_submissions_pkey")

    # Indexes
    op.execute("ALTER INDEX ix_assignments_course_id RENAME TO ix_homeworks_course_id")
    op.execute("ALTER INDEX ix_assignments_lesson_id RENAME TO ix_homeworks_lesson_id")
    op.execute("ALTER INDEX ix_assignment_submissions_assignment_id RENAME TO ix_homework_submissions_homework_id")
    op.execute("ALTER INDEX ix_assignment_submissions_user_id RENAME TO ix_homework_submissions_user_id")

    # Foreign key constraints
    op.execute("ALTER TABLE homeworks RENAME CONSTRAINT assignments_course_id_fkey TO homeworks_course_id_fkey")
    op.execute(
        "ALTER TABLE homeworks RENAME CONSTRAINT assignments_created_by_user_id_fkey "
        "TO homeworks_created_by_user_id_fkey"
    )
    op.execute("ALTER TABLE homeworks RENAME CONSTRAINT assignments_lesson_id_fkey TO homeworks_lesson_id_fkey")
    op.execute(
        "ALTER TABLE homework_submissions RENAME CONSTRAINT assignment_submissions_assignment_id_fkey "
        "TO homework_submissions_homework_id_fkey"
    )
    op.execute(
        "ALTER TABLE homework_submissions RENAME CONSTRAINT assignment_submissions_graded_by_user_id_fkey "
        "TO homework_submissions_graded_by_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE homework_submissions RENAME CONSTRAINT assignment_submissions_user_id_fkey "
        "TO homework_submissions_user_id_fkey"
    )


def downgrade() -> None:
    # Foreign key constraints
    op.execute(
        "ALTER TABLE homework_submissions RENAME CONSTRAINT homework_submissions_user_id_fkey "
        "TO assignment_submissions_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE homework_submissions RENAME CONSTRAINT homework_submissions_graded_by_user_id_fkey "
        "TO assignment_submissions_graded_by_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE homework_submissions RENAME CONSTRAINT homework_submissions_homework_id_fkey "
        "TO assignment_submissions_assignment_id_fkey"
    )
    op.execute("ALTER TABLE homeworks RENAME CONSTRAINT homeworks_lesson_id_fkey TO assignments_lesson_id_fkey")
    op.execute(
        "ALTER TABLE homeworks RENAME CONSTRAINT homeworks_created_by_user_id_fkey "
        "TO assignments_created_by_user_id_fkey"
    )
    op.execute("ALTER TABLE homeworks RENAME CONSTRAINT homeworks_course_id_fkey TO assignments_course_id_fkey")

    # Indexes
    op.execute("ALTER INDEX ix_homework_submissions_user_id RENAME TO ix_assignment_submissions_user_id")
    op.execute("ALTER INDEX ix_homework_submissions_homework_id RENAME TO ix_assignment_submissions_assignment_id")
    op.execute("ALTER INDEX ix_homeworks_lesson_id RENAME TO ix_assignments_lesson_id")
    op.execute("ALTER INDEX ix_homeworks_course_id RENAME TO ix_assignments_course_id")

    # Primary keys
    op.execute("ALTER INDEX homework_submissions_pkey RENAME TO assignment_submissions_pkey")
    op.execute("ALTER INDEX homeworks_pkey RENAME TO assignments_pkey")

    # Sequences
    op.execute("ALTER SEQUENCE homework_submissions_id_seq RENAME TO assignment_submissions_id_seq")
    op.execute("ALTER SEQUENCE homeworks_id_seq RENAME TO assignments_id_seq")

    op.alter_column("homework_submissions", "homework_id", new_column_name="assignment_id")
    op.rename_table("homework_submissions", "assignment_submissions")
    op.rename_table("homeworks", "assignments")
