"""Adopt ordered course topics and attach lessons.

Revision ID: c3e8b7f12a64
Revises: a7d3e9c21f40
Create Date: 2026-08-21 15:35:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3e8b7f12a64"
down_revision: Union[str, Sequence[str], None] = "a7d3e9c21f40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "course_topics" not in inspector.get_table_names():
        op.create_table(
            "course_topics",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("course_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        # Production already has the standalone prototype's topics. Keep all
        # records and normalize only its ordering-column name.
        topic_columns = _column_names("course_topics")
        if "position" in topic_columns and "order_index" not in topic_columns:
            op.alter_column("course_topics", "position", new_column_name="order_index")
        elif "order_index" not in topic_columns:
            op.add_column(
                "course_topics",
                sa.Column("order_index", sa.Integer(), nullable=False, server_default="1"),
            )

    if "ix_course_topics_course_id" not in _index_names("course_topics"):
        op.create_index(op.f("ix_course_topics_course_id"), "course_topics", ["course_id"], unique=False)

    lesson_columns = _column_names("lessons")
    if "topic_id" not in lesson_columns:
        op.add_column("lessons", sa.Column("topic_id", sa.Integer(), nullable=True))
    if "duration_minutes" not in lesson_columns:
        op.add_column("lessons", sa.Column("duration_minutes", sa.Integer(), nullable=True))

    if "ix_lessons_topic_id" not in _index_names("lessons"):
        op.create_index(op.f("ix_lessons_topic_id"), "lessons", ["topic_id"], unique=False)

    lesson_foreign_keys = sa.inspect(op.get_bind()).get_foreign_keys("lessons")
    if not any(foreign_key.get("constrained_columns") == ["topic_id"] for foreign_key in lesson_foreign_keys):
        op.create_foreign_key(
            "fk_lessons_topic_id",
            "lessons",
            "course_topics",
            ["topic_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Courses that have lessons but no prepared topics get a safe default.
    op.execute(
        """
        INSERT INTO course_topics (course_id, title, order_index, created_at, updated_at)
        SELECT DISTINCT l.course_id, 'Barcha darslar', 1, now(), now()
        FROM lessons AS l
        WHERE NOT EXISTS (
            SELECT 1 FROM course_topics AS existing WHERE existing.course_id = l.course_id
        )
        """
    )

    # Existing demo lessons and topics both begin with their order number. The
    # nearest-number rule preserves that grouping and sensibly places overflow
    # lessons in the last topic. New lessons are linked explicitly by the API.
    op.execute(
        """
        UPDATE lessons AS lesson
        SET topic_id = (
            SELECT topic.id
            FROM course_topics AS topic
            WHERE topic.course_id = lesson.course_id
            ORDER BY abs(
                topic.order_index - COALESCE(
                    (substring(lesson.topic from '^[[:space:]]*([0-9]+)'))::integer,
                    1
                )
            ), topic.order_index, topic.id
            LIMIT 1
        )
        WHERE lesson.topic_id IS NULL
        """
    )


def downgrade() -> None:
    lesson_foreign_keys = sa.inspect(op.get_bind()).get_foreign_keys("lessons")
    topic_foreign_key = next(
        (
            foreign_key["name"]
            for foreign_key in lesson_foreign_keys
            if foreign_key.get("constrained_columns") == ["topic_id"]
        ),
        None,
    )
    if topic_foreign_key:
        op.drop_constraint(topic_foreign_key, "lessons", type_="foreignkey")
    if "ix_lessons_topic_id" in _index_names("lessons"):
        op.drop_index(op.f("ix_lessons_topic_id"), table_name="lessons")
    lesson_columns = _column_names("lessons")
    if "duration_minutes" in lesson_columns:
        op.drop_column("lessons", "duration_minutes")
    if "topic_id" in lesson_columns:
        op.drop_column("lessons", "topic_id")

    # Keep the adopted topic data on rollback and restore the legacy name. A
    # harmless leftover table is preferable to destroying prepared curricula.
    if "ix_course_topics_course_id" in _index_names("course_topics"):
        op.drop_index(op.f("ix_course_topics_course_id"), table_name="course_topics")
    topic_columns = _column_names("course_topics")
    if "order_index" in topic_columns and "position" not in topic_columns:
        op.alter_column("course_topics", "order_index", new_column_name="position")
