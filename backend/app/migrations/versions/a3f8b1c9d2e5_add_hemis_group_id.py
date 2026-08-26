"""groups.hemis_group_id — привязка группы к её оригиналу в студенческом HEMIS

Зачем отдельный столбец, а не ``external_id``. Тот занят EPOS: после
синхронизации у группы стоит ``external_source='eduplan'`` и ``external_id`` с
идентификатором EduPlan. Идентификатор HEMIS — другое число из другой системы,
и хранить оба в одном поле нельзя.

Заполнять его неоткуда автоматически: EPOS отдаёт по группе только
``id/name/speciality_id/course/education_shape/student_count``, HEMIS-овского
идентификатора среди них нет. Поэтому столбец заводится пустым и заполняется на
входе студента — при первом однозначном совпадении по имени.

Revision ID: a3f8b1c9d2e5
Revises: f1a2b3c4d5e6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f8b1c9d2e5"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("hemis_group_id", sa.String(length=64), nullable=True))
    # Частичный: групп с пустым полем в таблице сколько угодно, обычный UNIQUE
    # пропустил бы только одну.
    op.create_index(
        "uq_groups_hemis_group_id",
        "groups",
        ["hemis_group_id"],
        unique=True,
        postgresql_where=sa.text("hemis_group_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_groups_hemis_group_id", table_name="groups")
    op.drop_column("groups", "hemis_group_id")
