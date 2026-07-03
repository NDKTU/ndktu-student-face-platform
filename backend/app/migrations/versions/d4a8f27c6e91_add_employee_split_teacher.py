"""add employee table, split teacher into employee + teacher

Introduces the `employees` table as the generic "staff profile" entity
(personal info + user_id), and turns `teachers` into a thin teaching-specific
record pointing at an employee via `employee_id` instead of directly at a
user. Existing `teachers` rows are backfilled into `employees` before the
old columns are dropped.

Revision ID: d4a8f27c6e91
Revises: b7c3e9f1a2d4
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4a8f27c6e91"
down_revision: Union[str, Sequence[str], None] = "b7c3e9f1a2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the employees table.
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("last_name", sa.String(length=255), nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("third_name", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=500), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=True),
        sa.Column("image_url", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("full_name"),
    )

    # 2. Backfill: every existing teacher row becomes an employee row.
    op.execute(
        """
        INSERT INTO employees (user_id, first_name, last_name, third_name, full_name, created_at, updated_at)
        SELECT user_id, first_name, last_name, third_name, full_name, created_at, updated_at
        FROM teachers
        """
    )

    # 3. Add the new employee_id column to teachers (nullable for now).
    op.add_column("teachers", sa.Column("employee_id", sa.Integer(), nullable=True))

    # 4. Backfill teachers.employee_id from the freshly-created employees rows.
    op.execute(
        """
        UPDATE teachers t
        SET employee_id = e.id
        FROM employees e
        WHERE e.user_id = t.user_id
        """
    )

    # 5. Enforce NOT NULL + FK + uniqueness on teachers.employee_id.
    op.alter_column("teachers", "employee_id", nullable=False)
    op.create_foreign_key(
        "teachers_employee_id_fkey", "teachers", "employees", ["employee_id"], ["id"]
    )
    op.create_unique_constraint("teachers_employee_id_key", "teachers", ["employee_id"])

    # 6. Drop the old personal-info / user_id columns from teachers.
    op.drop_constraint("teachers_full_name_key", "teachers", type_="unique")
    op.drop_constraint("teachers_user_id_fkey", "teachers", type_="foreignkey")
    op.drop_column("teachers", "full_name")
    op.drop_column("teachers", "third_name")
    op.drop_column("teachers", "first_name")
    op.drop_column("teachers", "last_name")
    op.drop_column("teachers", "user_id")


def downgrade() -> None:
    # Reverse of upgrade(): rebuild the flat columns on teachers from employees,
    # then drop the employees table. Any employee that never had a matching
    # teacher (e.g. non-teaching staff created after the upgrade) has no home
    # in the old schema and is necessarily lost here.
    op.add_column("teachers", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("teachers", sa.Column("last_name", sa.String(length=255), nullable=True))
    op.add_column("teachers", sa.Column("first_name", sa.String(length=255), nullable=True))
    op.add_column("teachers", sa.Column("third_name", sa.String(length=255), nullable=True))
    op.add_column("teachers", sa.Column("full_name", sa.String(length=500), nullable=True))

    op.execute(
        """
        UPDATE teachers t
        SET user_id = e.user_id,
            last_name = e.last_name,
            first_name = e.first_name,
            third_name = e.third_name,
            full_name = e.full_name
        FROM employees e
        WHERE e.id = t.employee_id
        """
    )

    op.alter_column("teachers", "user_id", nullable=False)
    op.alter_column("teachers", "last_name", nullable=False)
    op.alter_column("teachers", "first_name", nullable=False)
    op.alter_column("teachers", "third_name", nullable=False)
    op.alter_column("teachers", "full_name", nullable=False)

    op.create_unique_constraint("teachers_full_name_key", "teachers", ["full_name"])
    op.create_foreign_key("teachers_user_id_fkey", "teachers", "users", ["user_id"], ["id"])

    op.drop_constraint("teachers_employee_id_key", "teachers", type_="unique")
    op.drop_constraint("teachers_employee_id_fkey", "teachers", type_="foreignkey")
    op.drop_column("teachers", "employee_id")

    op.drop_table("employees")
