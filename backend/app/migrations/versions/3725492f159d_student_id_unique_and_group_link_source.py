"""student_id_unique_and_group_link_source

Revision ID: 3725492f159d
Revises: e4a1c7b93d20
Create Date: 2026-09-08 09:55:53.341175

Две вещи, обе про импорт студентов из HEMIS.

`students.student_id_number` — ключ, по которому импорт находит человека, а
личный кабинет узнаёт вошедшего. Уникальности у него не было: два прогона
подряд (cron и кнопка администратора) заводили студента дважды. Индекс
частичный — у заведённых вручную строк номер бывает пустым.

`groups.hemis_group_id_source` помнит, кто проставил связку с группой HEMIS.
Без этого прогон EduPlan переписывал своим `hemis_id` то, что администратор
разобрал руками на экране сопоставления.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3725492f159d'
down_revision: Union[str, Sequence[str], None] = 'e4a1c7b93d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "groups",
        sa.Column("hemis_group_id_source", sa.String(length=16), nullable=True),
    )
    # Уже связанным группам проставляем происхождение: всё, что есть сейчас,
    # приехало из EPOS или было угадано по имени при входе студента — ручного
    # разбора до появления этого столбца просто не существовало.
    op.execute(
        "UPDATE groups SET hemis_group_id_source = 'eduplan' "
        "WHERE hemis_group_id IS NOT NULL AND external_source = 'eduplan'"
    )
    op.create_index(
        "uq_students_student_id_number",
        "students",
        ["student_id_number"],
        unique=True,
        postgresql_where=sa.text("student_id_number <> ''"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_students_student_id_number", table_name="students")
    op.drop_column("groups", "hemis_group_id_source")
