"""Kurs savollari: nazorat turi bo'yicha (ON1, ON2, JN1, JN2, YN, boshqa)

Revision ID: c3d5e7f9a124
Revises: b2c4e6a8d013
Create Date: 2026-10-02 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d5e7f9a124"
down_revision: Union[str, Sequence[str], None] = "b2c4e6a8d013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("questions", sa.Column("course_id", sa.Integer(), nullable=True))
    op.add_column("questions", sa.Column("control_type", sa.String(length=16), nullable=True))
    op.create_foreign_key(
        "fk_questions_course_id_courses",
        "questions",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_questions_course_id", "questions", ["course_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_questions_course_id", table_name="questions")
    op.drop_constraint("fk_questions_course_id_courses", "questions", type_="foreignkey")
    op.drop_column("questions", "control_type")
    op.drop_column("questions", "course_id")
