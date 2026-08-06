"""curriculum.teacher_id, индексы под FK, регистронезависимое имя роли

Три независимые правки, но все — про целостность и стоимость запросов,
поэтому одной миграцией.

1. curriculum.teacher_user_id ссылался на users, хотя рядом
   teacher_assignments.teacher_id и subject_teachers.teacher_id ссылаются на
   teachers. Одно и то же имя вело в разные таблицы. Переезжает на teachers и
   переименовывается в teacher_id. Снимок teacher_name убирается — ФИО берётся
   join'ом через employees, как это уже сделано для декана и заведующего.

2. Семь FK-столбцов остались без индексов. Четыре из них — user_roles и
   role_permissions — джойнятся на КАЖДОМ запросе не-админа при проверке права.

3. UNIQUE на roles.name был регистрозависимым, а код сравнивал через lower().
   «Dekan» и «dekan» пролезали в базу обе, хотя приложение считает их одной
   ролью. Заменяется функциональным индексом.

Revision ID: d47a1c6e2f80
Revises: c92f4a17be03
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d47a1c6e2f80"
down_revision: Union[str, Sequence[str], None] = "c92f4a17be03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_FK_CURRICULUM_TEACHER = "curriculum_teacher_user_id_fkey"
_OLD_IX_CURRICULUM_TEACHER = "ix_curriculum_teacher_user_id"
_NEW_FK_CURRICULUM_TEACHER = "fk_curriculum_teacher_id_teachers"
_NEW_IX_CURRICULUM_TEACHER = "ix_curriculum_teacher_id"

_OLD_UQ_ROLE_NAME = "roles_name_key"
_NEW_UQ_ROLE_NAME = "uq_roles_name_lower"

# Столбцы, по которым ходят джойны, но индекса под ними не было.
_MISSING_INDEXES = [
    ("user_roles", "user_id"),
    ("user_roles", "role_id"),
    ("role_permissions", "role_id"),
    ("role_permissions", "permission_id"),
    ("students", "user_id"),
    ("students", "group_id"),
    ("teachers", "kafedra_id"),
]


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # --- 1. curriculum: ведущий преподаватель -----------------------------
    op.add_column("curriculum", sa.Column("teacher_id", sa.Integer(), nullable=True))
    # Значения переносимы: users → employees → teachers.
    conn.execute(
        sa.text(
            """
            UPDATE curriculum c
            SET teacher_id = t.id
            FROM employees e
            JOIN teachers t ON t.employee_id = e.id
            WHERE e.user_id = c.teacher_user_id
            """
        )
    )
    op.create_index(_NEW_IX_CURRICULUM_TEACHER, "curriculum", ["teacher_id"], unique=False)
    op.create_foreign_key(
        _NEW_FK_CURRICULUM_TEACHER, "curriculum", "teachers", ["teacher_id"], ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint(_OLD_FK_CURRICULUM_TEACHER, "curriculum", type_="foreignkey")
    op.drop_index(_OLD_IX_CURRICULUM_TEACHER, table_name="curriculum")
    op.drop_column("curriculum", "teacher_user_id")
    op.drop_column("curriculum", "teacher_name")

    # --- 2. Индексы под внешними ключами ----------------------------------
    for table, column in _MISSING_INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column], unique=False)

    # --- 3. Имя роли без учёта регистра -----------------------------------
    # Если «Dekan» и «dekan» уже сосуществуют, уникальный индекс не создастся —
    # лучше остановиться заранее и назвать конкретные строки, чем упасть на
    # невнятной ошибке PostgreSQL.
    dupes = conn.execute(
        sa.text("SELECT lower(name), count(*) FROM roles GROUP BY 1 HAVING count(*) > 1")
    ).all()
    if dupes:
        raise RuntimeError(
            "Роли, различающиеся только регистром: "
            + ", ".join(f"{name} ×{n}" for name, n in dupes)
            + ". Слейте их вручную и повторите миграцию."
        )
    op.drop_constraint(_OLD_UQ_ROLE_NAME, "roles", type_="unique")
    op.create_index(_NEW_UQ_ROLE_NAME, "roles", [sa.text("lower(name)")], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()

    op.drop_index(_NEW_UQ_ROLE_NAME, table_name="roles")
    op.create_unique_constraint(_OLD_UQ_ROLE_NAME, "roles", ["name"])

    for table, column in _MISSING_INDEXES:
        op.drop_index(f"ix_{table}_{column}", table_name=table)

    op.add_column("curriculum", sa.Column("teacher_name", sa.String(length=255), nullable=True))
    op.add_column("curriculum", sa.Column("teacher_user_id", sa.Integer(), nullable=True))
    # Обратный путь тоже восстановим: teachers → employees → users, имя оттуда же.
    conn.execute(
        sa.text(
            """
            UPDATE curriculum c
            SET teacher_user_id = e.user_id, teacher_name = e.full_name
            FROM teachers t
            JOIN employees e ON e.id = t.employee_id
            WHERE t.id = c.teacher_id
            """
        )
    )
    op.create_index(_OLD_IX_CURRICULUM_TEACHER, "curriculum", ["teacher_user_id"], unique=False)
    op.create_foreign_key(
        _OLD_FK_CURRICULUM_TEACHER, "curriculum", "users", ["teacher_user_id"], ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint(_NEW_FK_CURRICULUM_TEACHER, "curriculum", type_="foreignkey")
    op.drop_index(_NEW_IX_CURRICULUM_TEACHER, table_name="curriculum")
    op.drop_column("curriculum", "teacher_id")
