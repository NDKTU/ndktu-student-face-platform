"""add departments table and employees.department_id

Revision ID: bb44a2fc35d0
Revises: 60f25dc690fe
Create Date: 2026-07-04 21:45:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bb44a2fc35d0"
down_revision: Union[str, Sequence[str], None] = "60f25dc690fe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "departments",
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.add_column("employees", sa.Column("department_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_employees_department_id"), "employees", ["department_id"], unique=False)
    op.create_foreign_key(
        "employees_department_id_fkey",
        "employees",
        "departments",
        ["department_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("employees_department_id_fkey", "employees", type_="foreignkey")
    op.drop_index(op.f("ix_employees_department_id"), table_name="employees")
    op.drop_column("employees", "department_id")
    op.drop_table("departments")
