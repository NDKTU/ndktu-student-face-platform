"""split teacher assignment into teacher_group and teacher_subject

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-25

Uchta jadval (`teacher_assignments`, `group_teachers`, `subject_teachers`)
ikkitaga yig'iladi: `teacher_group` va `teacher_subject`.

⚠️ Bu migratsiya QAYTMAYDI. (o'qituvchi, predmet, guruh) uchligi ikkita
juftlikka yoyilgach, undan qaytib tiklanmaydi — shuning uchun `downgrade()`
ataylab `NotImplementedError` beradi.

⚠️ `group_teachers.teacher_id` — bu `users.id`, `subject_teachers.teacher_id`
va `teacher_assignments.teacher_id` esa `teachers.id`. Yangi ikkala jadval ham
`teachers.id` ga tayanadi, shuning uchun faqat `group_teachers` satrlari
`teachers.user_id` orqali tarjima qilinadi.

⚠️ `subject_teachers` da jufti qolmagan darslar o'chadi. Ishlab chiqarish
bazasida bajarishdan oldin `make backup-database` va tekshiruv:
    SELECT count(*) FROM lessons l
    LEFT JOIN subject_teachers st ON st.id = l.subject_teacher_id
    WHERE st.id IS NULL;
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. teacher_subject: teacher_assignments dan (guruh bo'yicha yig'ib)
    op.create_table(
        "teacher_subject",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("load_types", postgresql.JSONB(), nullable=True),
        sa.Column("semester_type", sa.String(32), nullable=True),
        sa.Column("external_id", sa.String(64), nullable=True),
        sa.Column("external_source", sa.String(32), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("teacher_id", "subject_id", name="uq_teacher_subject"),
    )
    op.create_index("ix_teacher_subject_teacher_id", "teacher_subject", ["teacher_id"])
    op.create_index("ix_teacher_subject_subject_id", "teacher_subject", ["subject_id"])
    op.create_index(
        "uq_teacher_subject_external_ref",
        "teacher_subject",
        ["external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    # Eski subject_teachers + teacher_assignments dan birlashtirib ko'chiramiz.
    op.execute("""
        INSERT INTO teacher_subject (teacher_id, subject_id, load_types, semester_type,
                                     external_source, is_active, created_at, updated_at)
        SELECT teacher_id, subject_id,
               (array_agg(load_types) FILTER (WHERE load_types IS NOT NULL))[1],
               max(semester_type),
               max(external_source),
               bool_or(is_active),
               min(created_at), max(updated_at)
        FROM teacher_assignments
        GROUP BY teacher_id, subject_id
    """)
    op.execute("""
        INSERT INTO teacher_subject (teacher_id, subject_id, is_active, created_at, updated_at)
        SELECT st.teacher_id, st.subject_id, true, st.created_at, st.updated_at
        FROM subject_teachers st
        WHERE NOT EXISTS (
            SELECT 1 FROM teacher_subject ts
            WHERE ts.teacher_id = st.teacher_id AND ts.subject_id = st.subject_id
        )
    """)

    # 2. teacher_group
    op.create_table(
        "teacher_group",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(64), nullable=True),
        sa.Column("external_source", sa.String(32), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("teacher_id", "group_id", name="uq_teacher_group"),
    )
    op.create_index("ix_teacher_group_teacher_id", "teacher_group", ["teacher_id"])
    op.create_index("ix_teacher_group_group_id", "teacher_group", ["group_id"])
    op.create_index(
        "uq_teacher_group_external_ref",
        "teacher_group",
        ["external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    op.execute("""
        INSERT INTO teacher_group (teacher_id, group_id, external_source, is_active, created_at, updated_at)
        SELECT teacher_id, group_id, max(external_source), bool_or(is_active), min(created_at), max(updated_at)
        FROM teacher_assignments
        GROUP BY teacher_id, group_id
    """)
    # group_teachers.teacher_id -> users.id bo'lgani uchun teachers.id ga tarjima qilamiz (3-qaror).
    # Jufti topilmagan satrlar (o'qituvchi kartochkasi yo'q foydalanuvchi) tushib qoladi.
    op.execute("""
        INSERT INTO teacher_group (teacher_id, group_id, is_active, created_at, updated_at)
        SELECT t.id, gt.group_id, true, gt.created_at, gt.updated_at
        FROM group_teachers gt
        JOIN teachers t ON t.user_id = gt.teacher_id
        WHERE NOT EXISTS (
            SELECT 1 FROM teacher_group tg
            WHERE tg.teacher_id = t.id AND tg.group_id = gt.group_id
        )
    """)

    # 3. lessons.subject_teacher_id -> teacher_subject_id
    op.add_column("lessons", sa.Column("teacher_subject_id", sa.Integer(), nullable=True))
    op.execute("""
        UPDATE lessons l SET teacher_subject_id = ts.id
        FROM subject_teachers st
        JOIN teacher_subject ts
          ON ts.teacher_id = st.teacher_id AND ts.subject_id = st.subject_id
        WHERE l.subject_teacher_id = st.id
    """)
    op.execute("DELETE FROM lessons WHERE teacher_subject_id IS NULL")
    op.alter_column("lessons", "teacher_subject_id", nullable=False)
    op.create_foreign_key(
        "fk_lessons_teacher_subject_id",
        "lessons",
        "teacher_subject",
        ["teacher_subject_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_lessons_teacher_subject_id", "lessons", ["teacher_subject_id"])
    op.drop_column("lessons", "subject_teacher_id")

    # 4. Eski jadvallar
    op.drop_table("teacher_assignments")
    op.drop_table("group_teachers")
    op.drop_table("subject_teachers")


def downgrade() -> None:
    raise NotImplementedError("Uchlik (teacher, subject, group) tiklanmaydi — 3-qarorga qarang")
