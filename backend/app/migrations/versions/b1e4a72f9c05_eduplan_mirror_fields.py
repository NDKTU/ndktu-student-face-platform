"""eduplan_mirror_fields

Готовит справочники оргструктуры к роли зеркала EduPlan/EPOS.

Две независимые части:

1. Служебные поля (external_id / external_source / synced_at / is_active) и
   частичный уникальный индекс по (external_source, external_id) — он делает
   повторный прогон синхронизации идемпотентным.

2. Снятие ограничений, о которые импорт из EPOS гарантированно разбился бы:
   глобальные UNIQUE по имени заменяются составными, faculties.name
   расширяется с 50 до 255 символов, teachers.kafedra_id становится
   nullable (в EPOS преподаватель без кафедры — штатная ситуация),
   employees.full_name перестаёт быть уникальным (полные тёзки).

Плюс поля, которым в наших таблицах не было места: course /
education_shape / student_count у группы, education_type у специальности,
kafedra_id / credits у предмета, hemis_id / position / staff_type у сотрудника.

Revision ID: b1e4a72f9c05
Revises: 55ff8e93c6a6
Create Date: 2026-08-08 13:10:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1e4a72f9c05"
down_revision: Union[str, Sequence[str], None] = "55ff8e93c6a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Таблицы, получающие служебные поля зеркала.
MIRRORED_TABLES = (
    "faculties",
    "kafedras",
    "specialities",
    "groups",
    "subjects",
    "employees",
    "departments",
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # The legacy LMS branch replaced groups.faculty_id with speciality_id.
    # Main uses both: restore faculty_id from the existing hierarchy before
    # changing the uniqueness rule below.
    group_columns = {column["name"] for column in inspector.get_columns("groups")}
    legacy_group_schema = "faculty_id" not in group_columns
    if legacy_group_schema:
        op.add_column("groups", sa.Column("faculty_id", sa.Integer(), nullable=True))
        op.execute(
            """
            UPDATE groups AS g
            SET faculty_id = k.faculty_id
            FROM specialities AS s
            JOIN kafedras AS k ON k.id = s.kafedra_id
            WHERE s.id = g.speciality_id
            """
        )
        missing_faculty = bind.execute(sa.text("SELECT count(*) FROM groups WHERE faculty_id IS NULL")).scalar_one()
        if missing_faculty:
            raise RuntimeError(f"Cannot restore groups.faculty_id for {missing_faculty} legacy group(s)")
        op.alter_column("groups", "faculty_id", existing_type=sa.Integer(), nullable=False)
        op.create_index("ix_groups_faculty_id", "groups", ["faculty_id"])
        op.create_foreign_key(
            "fk_groups_faculty_id_faculties",
            "groups",
            "faculties",
            ["faculty_id"],
            ["id"],
        )

    # ------------------------------------------------------------------ #
    #  1. Служебные поля зеркала
    # ------------------------------------------------------------------ #
    for table in MIRRORED_TABLES:
        op.add_column(table, sa.Column("external_id", sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column("external_source", sa.String(length=32), nullable=True))
        op.add_column(table, sa.Column("synced_at", sa.DateTime(), nullable=True))
        op.add_column(
            table,
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )
        # Частичный: строк, заведённых вручную (external_id IS NULL), в таблице
        # сколько угодно, и обычный UNIQUE их бы не пропустил.
        op.create_index(
            f"uq_{table}_external_ref",
            table,
            ["external_source", "external_id"],
            unique=True,
            postgresql_where=sa.text("external_id IS NOT NULL"),
        )

    # ------------------------------------------------------------------ #
    #  2. Снятие ограничений
    # ------------------------------------------------------------------ #
    # faculties.name: 50 символов не хватает под названия из EPOS.
    op.alter_column(
        "faculties",
        "name",
        existing_type=sa.String(length=50),
        type_=sa.String(length=255),
        existing_nullable=False,
    )

    # Кафедра уникальна в пределах факультета, а не всего вуза.
    op.drop_constraint("kafedras_name_key", "kafedras", type_="unique")
    op.create_unique_constraint("uq_kafedras_faculty_id_name", "kafedras", ["faculty_id", "name"])

    # То же для группы и специальности.
    op.drop_constraint("groups_name_key", "groups", type_="unique")
    op.create_unique_constraint("uq_groups_faculty_id_name", "groups", ["faculty_id", "name"])

    op.drop_constraint("specialities_name_key", "specialities", type_="unique")
    op.create_unique_constraint("uq_specialities_kafedra_id_name", "specialities", ["kafedra_id", "name"])

    # Полные тёзки среди сотрудников — обычное дело, уникальность снимаем,
    # но поиск по ФИО остаётся частым, поэтому оставляем обычный индекс.
    employee_unique_constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("employees")}
    if "employees_full_name_key" in employee_unique_constraints:
        op.drop_constraint("employees_full_name_key", "employees", type_="unique")
    op.create_index("ix_employees_full_name", "employees", ["full_name"])

    # В EPOS преподаватель может не иметь кафедры.
    op.alter_column("teachers", "kafedra_id", existing_type=sa.Integer(), nullable=True)

    # ------------------------------------------------------------------ #
    #  3. Поля, приезжающие из EPOS
    # ------------------------------------------------------------------ #
    op.add_column("groups", sa.Column("course", sa.Integer(), nullable=True))
    op.add_column("groups", sa.Column("education_shape", sa.String(length=32), nullable=True))
    op.add_column("groups", sa.Column("student_count", sa.Integer(), nullable=True))
    if legacy_group_schema and "kurs" in group_columns:
        op.execute("UPDATE groups SET course = kurs WHERE kurs IS NOT NULL")

    op.add_column("specialities", sa.Column("education_type", sa.String(length=32), nullable=True))

    # The retired LMS feature branch had already introduced this column (with
    # an equivalent FK under a different name).  Legacy databases stamped at
    # 55ff8e93c6a6 must retain it while fresh databases still need it created.
    subject_columns = {column["name"] for column in inspector.get_columns("subjects")}
    if "kafedra_id" not in subject_columns:
        op.add_column("subjects", sa.Column("kafedra_id", sa.Integer(), nullable=True))
    op.add_column("subjects", sa.Column("credits", sa.Integer(), nullable=True))
    subject_indexes = {index["name"] for index in inspector.get_indexes("subjects")}
    if "ix_subjects_kafedra_id" not in subject_indexes:
        op.create_index("ix_subjects_kafedra_id", "subjects", ["kafedra_id"])
    subject_foreign_keys = inspector.get_foreign_keys("subjects")
    if not any(fk.get("constrained_columns") == ["kafedra_id"] for fk in subject_foreign_keys):
        op.create_foreign_key(
            "subjects_kafedra_id_fkey",
            "subjects",
            "kafedras",
            ["kafedra_id"],
            ["id"],
            ondelete="SET NULL",
        )
    # Предмет уникален в пределах кафедры. У 754 существующих строк kafedra_id
    # пуст, а NULL в Postgres не конфликтует сам с собой — то есть на уже
    # накопленные данные ограничение не срабатывает и миграция не падает.
    op.drop_constraint("subjects_name_key", "subjects", type_="unique")
    op.create_unique_constraint("uq_subjects_kafedra_id_name", "subjects", ["kafedra_id", "name"])

    op.add_column("employees", sa.Column("hemis_id", sa.String(length=64), nullable=True))
    op.add_column("employees", sa.Column("position", sa.String(length=255), nullable=True))
    op.add_column("employees", sa.Column("staff_type", sa.String(length=64), nullable=True))
    op.create_index(
        "uq_employees_hemis_id",
        "employees",
        ["hemis_id"],
        unique=True,
        postgresql_where=sa.text("hemis_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema.

    Обратима полностью, но с одной оговоркой: если к моменту отката в
    справочниках успели появиться строки, нарушающие возвращаемые глобальные
    UNIQUE (одноимённые группы на разных факультетах, тёзки-сотрудники,
    преподаватели без кафедры), откат упадёт на создании ограничения. Это
    осознанно: молча удалять такие строки миграция не имеет права.
    """
    op.drop_index("uq_employees_hemis_id", table_name="employees")
    op.drop_column("employees", "staff_type")
    op.drop_column("employees", "position")
    op.drop_column("employees", "hemis_id")

    op.drop_constraint("uq_subjects_kafedra_id_name", "subjects", type_="unique")
    op.create_unique_constraint("subjects_name_key", "subjects", ["name"])
    op.drop_constraint("subjects_kafedra_id_fkey", "subjects", type_="foreignkey")
    op.drop_index("ix_subjects_kafedra_id", table_name="subjects")
    op.drop_column("subjects", "credits")
    op.drop_column("subjects", "kafedra_id")

    op.drop_column("specialities", "education_type")

    op.drop_column("groups", "student_count")
    op.drop_column("groups", "education_shape")
    op.drop_column("groups", "course")

    op.alter_column("teachers", "kafedra_id", existing_type=sa.Integer(), nullable=False)

    op.drop_index("ix_employees_full_name", table_name="employees")
    op.create_unique_constraint("employees_full_name_key", "employees", ["full_name"])

    op.drop_constraint("uq_specialities_kafedra_id_name", "specialities", type_="unique")
    op.create_unique_constraint("specialities_name_key", "specialities", ["name"])

    op.drop_constraint("uq_groups_faculty_id_name", "groups", type_="unique")
    op.create_unique_constraint("groups_name_key", "groups", ["name"])

    op.drop_constraint("uq_kafedras_faculty_id_name", "kafedras", type_="unique")
    op.create_unique_constraint("kafedras_name_key", "kafedras", ["name"])

    op.alter_column(
        "faculties",
        "name",
        existing_type=sa.String(length=255),
        type_=sa.String(length=50),
        existing_nullable=False,
    )

    for table in reversed(MIRRORED_TABLES):
        op.drop_index(f"uq_{table}_external_ref", table_name=table)
        op.drop_column(table, "is_active")
        op.drop_column(table, "synced_at")
        op.drop_column(table, "external_source")
        op.drop_column(table, "external_id")
