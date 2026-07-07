"""create teacher_assignments table

Revision ID: 60f25dc690fe
Revises: d5f4c6c7671c
Create Date: 2026-07-04 20:35:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "60f25dc690fe"
down_revision: Union[str, Sequence[str], None] = "d5f4c6c7671c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "teacher_assignments",
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("teacher_id", "subject_id", "group_id", name="uq_teacher_subject_group"),
    )
    op.create_index(op.f("ix_teacher_assignments_group_id"), "teacher_assignments", ["group_id"], unique=False)
    op.create_index(op.f("ix_teacher_assignments_subject_id"), "teacher_assignments", ["subject_id"], unique=False)
    op.create_index(op.f("ix_teacher_assignments_teacher_id"), "teacher_assignments", ["teacher_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_teacher_assignments_teacher_id"), table_name="teacher_assignments")
    op.drop_index(op.f("ix_teacher_assignments_subject_id"), table_name="teacher_assignments")
    op.drop_index(op.f("ix_teacher_assignments_group_id"), table_name="teacher_assignments")
    op.drop_table("teacher_assignments")
