"""teacher_assignment_eduplan_fields

Готовит ``teacher_assignments`` к приёму нагрузки из EduPlan.

В EduPlan на одну связку (преподаватель, предмет, группа) приходится по строке
нагрузки на каждый вид занятий — лекция, практика, лаборатория, оралик и
якуний назорат и так далее. Импорт схлопывает их в одно назначение, поэтому
перечень видов хранится списком в ``load_types``, а не отдельными строками:
иначе ограничение ``uq_teacher_subject_group`` не дало бы их записать.

``external_id`` у таких строк остаётся пустым — собранное из нескольких
источников назначение не имеет одного внешнего идентификатора. Владение
фиксируется через ``external_source``.

Revision ID: c2f5b83a1d46
Revises: b1e4a72f9c05
Create Date: 2026-08-08 13:35:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c2f5b83a1d46"
down_revision: Union[str, Sequence[str], None] = "b1e4a72f9c05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("teacher_assignments", sa.Column("external_id", sa.String(length=64), nullable=True))
    op.add_column("teacher_assignments", sa.Column("external_source", sa.String(length=32), nullable=True))
    op.add_column("teacher_assignments", sa.Column("synced_at", sa.DateTime(), nullable=True))
    op.add_column(
        "teacher_assignments",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("teacher_assignments", sa.Column("load_types", postgresql.JSONB(), nullable=True))
    op.add_column("teacher_assignments", sa.Column("semester_type", sa.String(length=32), nullable=True))
    op.create_index(
        "uq_teacher_assignments_external_ref",
        "teacher_assignments",
        ["external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_teacher_assignments_external_ref", table_name="teacher_assignments")
    op.drop_column("teacher_assignments", "semester_type")
    op.drop_column("teacher_assignments", "load_types")
    op.drop_column("teacher_assignments", "is_active")
    op.drop_column("teacher_assignments", "synced_at")
    op.drop_column("teacher_assignments", "external_source")
    op.drop_column("teacher_assignments", "external_id")
