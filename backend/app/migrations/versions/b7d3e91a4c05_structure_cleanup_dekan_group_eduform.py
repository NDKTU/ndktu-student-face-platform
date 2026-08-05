"""structure cleanup: dekan/mudir → employees, group без faculty_id, education_form на группе

Три независимых правки, но одна миграция: они трогают пересекающиеся таблицы,
и разнести их значило бы оставить базу в промежуточном состоянии, где дерево
структуры уже не собирается.

1. Декан и заведующий кафедрой ссылались на users. Учётка есть и у студента,
   и у админа — деканом можно было назначить кого угодно, а ФИО оттуда всё
   равно не достать, оно в employees. Ссылка переезжает на employees, дубль
   имени (dekan_name/mudir_name) уходит: имя берётся join'ом.
2. groups.faculty_id — второй, независимый путь к факультету. Ничто не держало
   его в согласии с speciality → kafedra → faculty: одним UPDATE группа
   переезжала на чужой факультет, и дерево со списком групп начинали отвечать
   по-разному. Остаётся один путь, speciality_id становится обязательным.
3. education_form лежала на специальности и на студенте двумя несвязанными
   строками без всякой проверки. Форма — свойство группы (у специальности
   name UNIQUE, и двух строк под одно направление она не даёт), тип теперь
   настоящий ENUM.

Revision ID: b7d3e91a4c05
Revises: 16eb5dc870b6
Create Date: 2026-08-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b7d3e91a4c05"
down_revision: Union[str, Sequence[str], None] = "16eb5dc870b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# create_type=False: тип создаётся явным вызовом .create(), иначе add_column
# попробует создать его второй раз и упадёт.
education_form_enum = postgresql.ENUM(
    "Kunduzgi", "Kechki", "Masofaviy", "Sirtqi", name="education_form", create_type=False
)

# Имена проставлены руками: autogenerate оставляет None, и тогда downgrade
# падает на drop_constraint(None). Новые — по naming_convention из config.py,
# старые — те, что реально лежат в базе (часть создавалась до соглашения,
# поэтому в них postgres'овский суффикс _fkey).
_OLD_FK_FACULTY_DEKAN = "fk_faculties_dekan_user_id_users"
_OLD_IX_FACULTY_DEKAN = "ix_faculties_dekan_user_id"
_NEW_IX_FACULTY_DEKAN = "ix_faculties_dekan_employee_id"
_NEW_FK_FACULTY_DEKAN = "fk_faculties_dekan_employee_id_employees"

_OLD_FK_KAFEDRA_MUDIR = "fk_kafedras_mudir_user_id_users"
_OLD_IX_KAFEDRA_MUDIR = "ix_kafedras_mudir_user_id"
_NEW_IX_KAFEDRA_MUDIR = "ix_kafedras_mudir_employee_id"
_NEW_FK_KAFEDRA_MUDIR = "fk_kafedras_mudir_employee_id_employees"

_OLD_FK_GROUP_FACULTY = "groups_faculty_id_fkey"
_NEW_FK_GROUP_FACULTY = "fk_groups_faculty_id_faculties"
_OLD_FK_GROUP_SPECIALITY = "groups_speciality_id_fkey"
_NEW_FK_GROUP_SPECIALITY = "fk_groups_speciality_id_specialities"

# Типографские апострофы из HEMIS сводим к обычному — тем же правилом, что
# normalized_name в app/core/schemas.py. Без этого «O‘quv» из HEMIS и «O'quv»
# из формы остаются разными строками и поиск по имени молча промахивается.
_FOLD_APOSTROPHES = (
    "replace(replace(replace(replace(replace({col}, '‘', ''''), '’', ''''), "
    "'ʻ', ''''), 'ʼ', ''''), '`', '''')"
)
_NORMALIZED_TABLES = ("faculties", "kafedras", "specialities", "groups")


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # --- 1. Декан и заведующий кафедрой -----------------------------------
    # Значения не переносим: dekan_user_id указывал на users, новый столбец —
    # на employees, и у большинства учёток карточки сотрудника просто нет.
    # Назначения проставляются заново через интерфейс.
    op.drop_constraint(_OLD_FK_FACULTY_DEKAN, "faculties", type_="foreignkey")
    op.drop_index(_OLD_IX_FACULTY_DEKAN, table_name="faculties")
    op.drop_column("faculties", "dekan_user_id")
    op.drop_column("faculties", "dekan_name")
    op.add_column("faculties", sa.Column("dekan_employee_id", sa.Integer(), nullable=True))
    # unique + index вместе дают уникальный индекс, а не отдельный constraint —
    # так же, как их трактует SQLAlchemy в модели.
    op.create_index(_NEW_IX_FACULTY_DEKAN, "faculties", ["dekan_employee_id"], unique=True)
    op.create_foreign_key(
        _NEW_FK_FACULTY_DEKAN, "faculties", "employees", ["dekan_employee_id"], ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint(_OLD_FK_KAFEDRA_MUDIR, "kafedras", type_="foreignkey")
    op.drop_index(_OLD_IX_KAFEDRA_MUDIR, table_name="kafedras")
    op.drop_column("kafedras", "mudir_user_id")
    op.drop_column("kafedras", "mudir_name")
    op.add_column("kafedras", sa.Column("mudir_employee_id", sa.Integer(), nullable=True))
    op.create_index(_NEW_IX_KAFEDRA_MUDIR, "kafedras", ["mudir_employee_id"], unique=True)
    op.create_foreign_key(
        _NEW_FK_KAFEDRA_MUDIR, "kafedras", "employees", ["mudir_employee_id"], ["id"],
        ondelete="SET NULL",
    )

    # --- 2. Группа: один путь к факультету --------------------------------
    # Группа без специальности после этой миграции невыразима, а привязать её
    # автоматически не к чему — faculty_id говорит только о факультете.
    conn.execute(sa.text("DELETE FROM groups WHERE speciality_id IS NULL"))

    op.drop_constraint(_OLD_FK_GROUP_FACULTY, "groups", type_="foreignkey")
    op.drop_column("groups", "faculty_id")

    op.alter_column("groups", "speciality_id", existing_type=sa.Integer(), nullable=False)
    op.drop_constraint(_OLD_FK_GROUP_SPECIALITY, "groups", type_="foreignkey")
    # RESTRICT вместо SET NULL: удаление специальности, за которой числятся
    # группы со студентами, должно быть осознанным решением человека, а не
    # тихо оставлять группы без направления.
    op.create_foreign_key(
        _NEW_FK_GROUP_SPECIALITY, "groups", "specialities", ["speciality_id"], ["id"],
        ondelete="RESTRICT",
    )

    # --- 3. Форма обучения -------------------------------------------------
    education_form_enum.create(conn, checkfirst=True)
    op.add_column("groups", sa.Column("education_form", education_form_enum, nullable=True))
    # Переносим то, что можно: у группы своей формы не было, но у её
    # специальности — была.
    conn.execute(
        sa.text(
            """
            UPDATE groups g
            SET education_form = s.education_form::education_form
            FROM specialities s
            WHERE s.id = g.speciality_id
              AND s.education_form IN ('Kunduzgi', 'Kechki', 'Masofaviy', 'Sirtqi')
            """
        )
    )
    op.drop_column("specialities", "education_form")
    op.drop_column("students", "education_form")

    # --- 4. Перенормализация имён -----------------------------------------
    for table in _NORMALIZED_TABLES:
        conn.execute(
            sa.text(f"UPDATE {table} SET name = {_FOLD_APOSTROPHES.format(col='name')}")
        )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()

    # --- 3. Форма обучения -------------------------------------------------
    op.add_column("specialities", sa.Column("education_form", sa.String(length=32), nullable=True))
    conn.execute(
        sa.text(
            """
            UPDATE specialities s
            SET education_form = sub.form
            FROM (
                SELECT DISTINCT ON (speciality_id) speciality_id, education_form::text AS form
                FROM groups
                WHERE education_form IS NOT NULL
                ORDER BY speciality_id, id
            ) sub
            WHERE sub.speciality_id = s.id
            """
        )
    )
    # NOT NULL без значений по умолчанию: сначала заливаем форму из группы
    # студента, затем снимаем server_default, чтобы столбец вернулся в тот
    # вид, в котором был.
    op.add_column(
        "students",
        sa.Column("education_form", sa.String(), nullable=False, server_default="Kunduzgi"),
    )
    conn.execute(
        sa.text(
            """
            UPDATE students st
            SET education_form = g.education_form::text
            FROM groups g
            WHERE g.id = st.group_id AND g.education_form IS NOT NULL
            """
        )
    )
    op.alter_column("students", "education_form", server_default=None)

    op.drop_column("groups", "education_form")
    education_form_enum.drop(conn, checkfirst=True)

    # --- 2. Группа ---------------------------------------------------------
    op.drop_constraint(_NEW_FK_GROUP_SPECIALITY, "groups", type_="foreignkey")
    op.create_foreign_key(
        _OLD_FK_GROUP_SPECIALITY, "groups", "specialities", ["speciality_id"], ["id"],
        ondelete="SET NULL",
    )
    op.alter_column("groups", "speciality_id", existing_type=sa.Integer(), nullable=True)

    # faculty_id восстановим вычислением: путь speciality → kafedra → faculty
    # ещё цел, так что значения не теряются.
    op.add_column("groups", sa.Column("faculty_id", sa.Integer(), nullable=True))
    conn.execute(
        sa.text(
            """
            UPDATE groups g
            SET faculty_id = k.faculty_id
            FROM specialities s
            JOIN kafedras k ON k.id = s.kafedra_id
            WHERE s.id = g.speciality_id
            """
        )
    )
    conn.execute(sa.text("DELETE FROM groups WHERE faculty_id IS NULL"))
    op.alter_column("groups", "faculty_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(_OLD_FK_GROUP_FACULTY, "groups", "faculties", ["faculty_id"], ["id"])

    # --- 1. Декан и заведующий кафедрой -----------------------------------
    # Здесь значения восстановимы: employees.user_id и employees.full_name.
    op.add_column("kafedras", sa.Column("mudir_name", sa.String(length=255), nullable=True))
    op.add_column("kafedras", sa.Column("mudir_user_id", sa.Integer(), nullable=True))
    conn.execute(
        sa.text(
            """
            UPDATE kafedras k
            SET mudir_user_id = e.user_id, mudir_name = e.full_name
            FROM employees e
            WHERE e.id = k.mudir_employee_id
            """
        )
    )
    op.drop_constraint(_NEW_FK_KAFEDRA_MUDIR, "kafedras", type_="foreignkey")
    op.drop_index(_NEW_IX_KAFEDRA_MUDIR, table_name="kafedras")
    op.drop_column("kafedras", "mudir_employee_id")
    op.create_index(_OLD_IX_KAFEDRA_MUDIR, "kafedras", ["mudir_user_id"], unique=False)
    op.create_foreign_key(
        _OLD_FK_KAFEDRA_MUDIR, "kafedras", "users", ["mudir_user_id"], ["id"], ondelete="SET NULL"
    )

    op.add_column("faculties", sa.Column("dekan_name", sa.String(length=255), nullable=True))
    op.add_column("faculties", sa.Column("dekan_user_id", sa.Integer(), nullable=True))
    conn.execute(
        sa.text(
            """
            UPDATE faculties f
            SET dekan_user_id = e.user_id, dekan_name = e.full_name
            FROM employees e
            WHERE e.id = f.dekan_employee_id
            """
        )
    )
    op.drop_constraint(_NEW_FK_FACULTY_DEKAN, "faculties", type_="foreignkey")
    op.drop_index(_NEW_IX_FACULTY_DEKAN, table_name="faculties")
    op.drop_column("faculties", "dekan_employee_id")
    op.create_index(_OLD_IX_FACULTY_DEKAN, "faculties", ["dekan_user_id"], unique=False)
    op.create_foreign_key(
        _OLD_FK_FACULTY_DEKAN, "faculties", "users", ["dekan_user_id"], ["id"], ondelete="SET NULL"
    )
