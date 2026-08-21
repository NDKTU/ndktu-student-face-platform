"""Grant course catalogue access to teachers and students.

Teachers and students already had lesson/resource permissions, but were
missing read:course, so the frontend route stopped them before they could
reach those lessons.

Revision ID: a7d3e9c21f40
Revises: f2b7c91d4e30
Create Date: 2026-08-21 14:35:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "a7d3e9c21f40"
down_revision: Union[str, Sequence[str], None] = "f2b7c91d4e30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles AS r
        JOIN permissions AS p ON p.name = 'read:course'
        WHERE lower(r.name) IN ('teacher', 'student')
          AND NOT EXISTS (
              SELECT 1
              FROM role_permissions AS rp
              WHERE rp.role_id = r.id AND rp.permission_id = p.id
          )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions AS rp
        USING roles AS r, permissions AS p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) IN ('teacher', 'student')
          AND p.name = 'read:course'
        """
    )
