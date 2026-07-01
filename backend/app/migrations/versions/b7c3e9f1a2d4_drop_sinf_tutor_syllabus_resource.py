"""drop sinf, tutor, syllabus and resource tables

Removes the Sinf, Tutor, Syllabus and Resource modules (and their join
tables). EducationPlan was never migrated into the database, so it is not
referenced here.

Revision ID: b7c3e9f1a2d4
Revises: abf2d4975379
Create Date: 2026-06-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b7c3e9f1a2d4"
down_revision: Union[str, Sequence[str], None] = "abf2d4975379"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop the removed feature tables (children first)."""
    op.drop_table("resources")
    op.drop_table("sinf_groups")
    op.drop_table("sinfs")
    op.drop_table("tutor_groups")
    op.drop_table("tutors")
    op.drop_table("syllabuses")


def downgrade() -> None:
    """Recreate the dropped tables (parents first)."""
    op.create_table(
        "syllabuses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("goals", sa.Text(), nullable=True),
        sa.Column("learning_outcomes", sa.Text(), nullable=True),
        sa.Column("prerequisites", sa.Text(), nullable=True),
        sa.Column("methodical_recommendations", sa.Text(), nullable=True),
        sa.Column("literature", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("grading_scheme", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("competencies", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("file_url", sa.String(length=500), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("course_id"),
    )
    op.create_index(op.f("ix_syllabuses_course_id"), "syllabuses", ["course_id"], unique=True)

    op.create_table(
        "tutors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("last_name", sa.String(length=255), nullable=False),
        sa.Column("third_name", sa.String(length=255), nullable=False),
        sa.Column("image_url", sa.String(length=255), nullable=True),
        sa.Column("phone_number", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "tutor_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tutor_id"], ["tutors.id"]),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"]),
        sa.UniqueConstraint("tutor_id", "group_id", name="idx_unique_tutor_group"),
    )

    op.create_table(
        "sinfs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("academic_year_id", sa.Integer(), nullable=True),
        sa.Column("semester_number", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_sinfs_subject_id"), "sinfs", ["subject_id"], unique=False)
    op.create_index(op.f("ix_sinfs_teacher_id"), "sinfs", ["teacher_id"], unique=False)
    op.create_index(op.f("ix_sinfs_academic_year_id"), "sinfs", ["academic_year_id"], unique=False)

    op.create_table(
        "sinf_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sinf_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["sinf_id"], ["sinfs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("sinf_id", "group_id", name="uq_sinf_group"),
    )
    op.create_index(op.f("ix_sinf_groups_sinf_id"), "sinf_groups", ["sinf_id"], unique=False)
    op.create_index(op.f("ix_sinf_groups_group_id"), "sinf_groups", ["group_id"], unique=False)

    op.create_table(
        "resources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject_teacher_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("main_text", sa.Text(), nullable=False),
        sa.Column("links", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("files", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["subject_teacher_id"], ["subject_teachers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["topic_id"], ["course_topics.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_resources_subject_teacher_id"), "resources", ["subject_teacher_id"], unique=False)
    op.create_index(op.f("ix_resources_group_id"), "resources", ["group_id"], unique=False)
    op.create_index(op.f("ix_resources_lesson_id"), "resources", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_resources_course_id"), "resources", ["course_id"], unique=False)
    op.create_index(op.f("ix_resources_topic_id"), "resources", ["topic_id"], unique=False)
