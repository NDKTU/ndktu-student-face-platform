"""split quiz ownership: add quizzes.created_by_user_id

Раньше `quizzes.user_id` означал одновременно и «чей банк вопросов собран в тест»,
и «кто тест создал»: тест создавал сам преподаватель, поэтому это был один человек.
Теперь тест создаёт организатор тестирования, а вопросы грузит лектор, и роли
разошлись.

`user_id` сохраняет смысл «лектор, чей банк использован» (в ORM переименован в
`Quiz.lecturer_id`), новая колонка `created_by_user_id` хранит организатора. Бэкфилл
`created_by_user_id = user_id` верен для всех существующих строк: до этого изменения
тест создавал именно тот преподаватель, чьи вопросы в него попадали.

Revision ID: e1a4b7c93d20
Revises: d3a6c14b7e92
Create Date: 2026-08-18 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1a4b7c93d20"
down_revision: Union[str, Sequence[str], None] = "d3a6c14b7e92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("quizzes", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_quizzes_created_by_user_id"),
        "quizzes",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_quizzes_created_by_user_id_users",
        "quizzes",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # До этой ревизии создателем теста всегда был преподаватель, чьи вопросы
    # в него подбирались, поэтому старое user_id — корректный организатор.
    op.execute("UPDATE quizzes SET created_by_user_id = user_id WHERE user_id IS NOT NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_quizzes_created_by_user_id_users", "quizzes", type_="foreignkey")
    op.drop_index(op.f("ix_quizzes_created_by_user_id"), table_name="quizzes")
    op.drop_column("quizzes", "created_by_user_id")
