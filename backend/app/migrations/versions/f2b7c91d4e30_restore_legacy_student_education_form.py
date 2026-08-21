"""Restore student education_form removed by the legacy LMS branch.

Revision ID: f2b7c91d4e30
Revises: e1a4b7c93d20
Create Date: 2026-08-21 11:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2b7c91d4e30"
down_revision: Union[str, Sequence[str], None] = "e1a4b7c93d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Restore and backfill the column only on legacy databases."""
    bind = op.get_bind()
    student_columns = {column["name"] for column in sa.inspect(bind).get_columns("students")}
    if "education_form" in student_columns:
        return

    op.add_column("students", sa.Column("education_form", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE students AS s
        SET education_form = COALESCE(g.education_form::text, g.education_shape)
        FROM groups AS g
        WHERE g.id = s.group_id
        """
    )
    missing = bind.execute(sa.text("SELECT count(*) FROM students WHERE education_form IS NULL")).scalar_one()
    if missing:
        raise RuntimeError(f"Cannot restore students.education_form for {missing} legacy student(s)")
    op.alter_column("students", "education_form", existing_type=sa.String(), nullable=False)


def downgrade() -> None:
    """Do not remove a column that is part of the canonical schema."""
