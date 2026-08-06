"""employee cleanup: job_titles, общий ENUM пола, снятие лишних полей

Четыре независимые правки в одной таблице, поэтому одна миграция.

1. status убран. В комментарии к модели было написано, что он влияет на вход,
   но путь логина его никогда не читал — «заблокированный» сотрудник заходил
   свободно. Плюс значения разъехались по апострофу: в базе «Taʼtilda» (U+02BC),
   фронтенд ждал «Ta'tilda» (ASCII) и молча показывал таких как «Faol».
   Заменять его нечем: блокировка входа признана ненужной.
2. last_login_at убран — его никто не записывал, столбец всегда оставался пустым.
3. С full_name снят UNIQUE. Полные тёзки в Узбекистане обычны, а ограничение
   не давало завести второго и отвечало невнятным «conflicts with an existing
   record».
4. position_title (свободная строка) заменён ссылкой на справочник job_titles.
   Назван так, а не positions: слово `position` в проекте уже занято — в семи
   моделях так называется порядковый номер в интерфейсе.

Плюс пол становится настоящим ENUM'ом, общим для employees и students: это одно
и то же поле одного и того же человека.

Revision ID: c92f4a17be03
Revises: b7d3e91a4c05
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c92f4a17be03"
down_revision: Union[str, Sequence[str], None] = "b7d3e91a4c05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# create_type=False: тип создаём явным вызовом, иначе add_column/alter попробует
# создать его второй раз.
gender_enum = postgresql.ENUM("Erkak", "Ayol", name="gender", create_type=False)

# Имена проставлены руками: autogenerate оставляет None, и downgrade падает на
# drop_constraint(None). Новые — по naming_convention из config.py, старое —
# то, что реально лежит в базе.
_OLD_UQ_FULL_NAME = "employees_full_name_key"
_IX_JOB_TITLE = "ix_employees_job_title_id"
_FK_JOB_TITLE = "fk_employees_job_title_id_job_titles"


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # --- 1. Справочник должностей -----------------------------------------
    op.create_table(
        "job_titles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_job_titles"),
        sa.UniqueConstraint("name", name="uq_job_titles_name"),
    )

    op.add_column("employees", sa.Column("job_title_id", sa.Integer(), nullable=True))
    op.create_index(_IX_JOB_TITLE, "employees", ["job_title_id"], unique=False)
    op.create_foreign_key(
        _FK_JOB_TITLE, "employees", "job_titles", ["job_title_id"], ["id"], ondelete="SET NULL"
    )

    # Переносим то, что уже введено: каждое непустое position_title становится
    # строкой справочника, сотрудник получает ссылку на неё.
    conn.execute(
        sa.text(
            """
            INSERT INTO job_titles (name)
            SELECT DISTINCT btrim(position_title)
            FROM employees
            WHERE position_title IS NOT NULL AND btrim(position_title) <> ''
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE employees e
            SET job_title_id = j.id
            FROM job_titles j
            WHERE j.name = btrim(e.position_title)
            """
        )
    )
    op.drop_column("employees", "position_title")

    # --- 2. Пол: свободная строка → общий ENUM ----------------------------
    gender_enum.create(conn, checkfirst=True)
    # Значения приводим к словарю до смены типа: иначе USING упадёт на первой
    # же строке с чем-то посторонним.
    for table in ("employees", "students"):
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} SET gender =
                    CASE WHEN lower(btrim(gender)) IN ('ayol', 'женский', 'f') THEN 'Ayol'
                         ELSE 'Erkak' END
                WHERE gender IS NOT NULL
                """
            )
        )
    op.alter_column(
        "employees", "gender",
        existing_type=sa.String(length=8), type_=gender_enum, existing_nullable=True,
        postgresql_using="gender::gender",
    )
    op.alter_column(
        "students", "gender",
        existing_type=sa.String(), type_=gender_enum, existing_nullable=False,
        postgresql_using="gender::gender",
    )

    # --- 3. Лишние столбцы ------------------------------------------------
    op.drop_constraint(_OLD_UQ_FULL_NAME, "employees", type_="unique")
    op.drop_column("employees", "status")
    op.drop_column("employees", "last_login_at")


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()

    op.add_column(
        "employees",
        sa.Column("status", sa.String(length=16), server_default="Faol", nullable=False),
    )
    op.add_column("employees", sa.Column("last_login_at", sa.DateTime(), nullable=True))
    # Значения этих двух восстановить не из чего: status никто не проверял,
    # last_login_at никто не писал.
    op.create_unique_constraint(_OLD_UQ_FULL_NAME, "employees", ["full_name"])

    op.alter_column(
        "students", "gender",
        existing_type=gender_enum, type_=sa.String(), existing_nullable=False,
        postgresql_using="gender::text",
    )
    op.alter_column(
        "employees", "gender",
        existing_type=gender_enum, type_=sa.String(length=8), existing_nullable=True,
        postgresql_using="gender::text",
    )
    gender_enum.drop(conn, checkfirst=True)

    # Должность возвращаем строкой из справочника — здесь значения восстановимы.
    op.add_column("employees", sa.Column("position_title", sa.String(length=128), nullable=True))
    conn.execute(
        sa.text(
            """
            UPDATE employees e
            SET position_title = j.name
            FROM job_titles j
            WHERE j.id = e.job_title_id
            """
        )
    )
    op.drop_constraint(_FK_JOB_TITLE, "employees", type_="foreignkey")
    op.drop_index(_IX_JOB_TITLE, table_name="employees")
    op.drop_column("employees", "job_title_id")
    op.drop_table("job_titles")
