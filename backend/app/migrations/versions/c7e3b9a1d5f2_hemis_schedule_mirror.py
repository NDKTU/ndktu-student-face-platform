"""HEMIS jadvali zerkalosi

`hemis_schedule_lessons` — `/rest/v1/data/schedule-list` dan darslar;
`hemis_student_groups` — talaba raqami → HEMIS guruhi. Ikkalasi ham
izolyatsiyalangan: tashqi kalitlar yo'q, qidiruv HEMIS identifikatorlari
bo'yicha.

Revision ID: c7e3b9a1d5f2
Revises: a4d7e2c9f1b3
Create Date: 2026-10-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7e3b9a1d5f2"
down_revision: Union[str, Sequence[str], None] = "a4d7e2c9f1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "hemis_schedule_lessons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hemis_id", sa.BigInteger(), nullable=False),
        sa.Column("education_year", sa.String(length=16), nullable=False),
        sa.Column("education_year_name", sa.String(length=32), nullable=False),
        sa.Column("semester_hemis_id", sa.Integer(), nullable=True),
        sa.Column("semester_code", sa.String(length=16), nullable=False),
        sa.Column("semester_name", sa.String(length=64), nullable=False),
        sa.Column("group_hemis_id", sa.Integer(), nullable=True),
        sa.Column("group_name", sa.String(length=255), nullable=False),
        sa.Column("education_lang", sa.String(length=64), nullable=False),
        sa.Column("subject_hemis_id", sa.Integer(), nullable=True),
        sa.Column("subject_code", sa.String(length=64), nullable=False),
        sa.Column("subject_name", sa.String(length=500), nullable=False),
        sa.Column("faculty_hemis_id", sa.Integer(), nullable=True),
        sa.Column("faculty_name", sa.String(length=255), nullable=False),
        sa.Column("department_hemis_id", sa.Integer(), nullable=True),
        sa.Column("department_name", sa.String(length=255), nullable=False),
        sa.Column("auditorium_code", sa.Integer(), nullable=True),
        sa.Column("auditorium_name", sa.String(length=128), nullable=False),
        sa.Column("auditorium_type", sa.String(length=64), nullable=False),
        sa.Column("building_hemis_id", sa.Integer(), nullable=True),
        sa.Column("building_name", sa.String(length=255), nullable=False),
        sa.Column("training_type_code", sa.String(length=16), nullable=False),
        sa.Column("training_type", sa.String(length=64), nullable=False),
        sa.Column("lesson_pair_code", sa.String(length=16), nullable=False),
        sa.Column("lesson_pair", sa.String(length=16), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("employee_hemis_id", sa.Integer(), nullable=True),
        sa.Column("employee_id_number", sa.String(length=64), nullable=True),
        sa.Column("employee_name", sa.String(length=255), nullable=False),
        sa.Column("lesson_date", sa.Date(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=True),
        sa.Column("week_end", sa.Date(), nullable=True),
        sa.Column("hemis_updated_at", sa.DateTime(), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hemis_schedule_lessons")),
        sa.UniqueConstraint("hemis_id", name=op.f("uq_hemis_schedule_lessons_hemis_id")),
    )
    op.create_index(
        op.f("ix_hemis_schedule_lessons_education_year"),
        "hemis_schedule_lessons",
        ["education_year"],
    )
    op.create_index(
        op.f("ix_hemis_schedule_lessons_lesson_date"),
        "hemis_schedule_lessons",
        ["lesson_date"],
    )
    op.create_index(
        "ix_hemis_schedule_lessons_employee_date",
        "hemis_schedule_lessons",
        ["employee_id_number", "lesson_date"],
    )
    op.create_index(
        "ix_hemis_schedule_lessons_group_date",
        "hemis_schedule_lessons",
        ["group_hemis_id", "lesson_date"],
    )

    op.create_table(
        "hemis_student_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id_number", sa.String(length=64), nullable=False),
        sa.Column("group_hemis_id", sa.Integer(), nullable=False),
        sa.Column("group_name", sa.String(length=255), nullable=False),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hemis_student_groups")),
        sa.UniqueConstraint(
            "student_id_number", name=op.f("uq_hemis_student_groups_student_id_number")
        ),
    )
    op.create_index(
        op.f("ix_hemis_student_groups_group_hemis_id"),
        "hemis_student_groups",
        ["group_hemis_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_hemis_student_groups_group_hemis_id"), table_name="hemis_student_groups")
    op.drop_table("hemis_student_groups")
    op.drop_index("ix_hemis_schedule_lessons_group_date", table_name="hemis_schedule_lessons")
    op.drop_index("ix_hemis_schedule_lessons_employee_date", table_name="hemis_schedule_lessons")
    op.drop_index(op.f("ix_hemis_schedule_lessons_lesson_date"), table_name="hemis_schedule_lessons")
    op.drop_index(op.f("ix_hemis_schedule_lessons_education_year"), table_name="hemis_schedule_lessons")
    op.drop_table("hemis_schedule_lessons")
