"""drop_course_topics

Revision ID: b8e5f1a3c927
Revises: a7d4e2c81b95
Create Date: 2026-09-09

Mavzular qatlami olib tashlanadi. Mavzu amalda mavzu emas, tur savati edi:
uning nomi turdan olinardi («Ma'ruza», «Laboratoriya»), formada alohida
sarlavha maydoni yo'q edi. Tur kurs darajasiga chiqqach, har bir kursda
bitta mavzu qolar va uning nomi kurs turi bilan bir xil bo'lar edi.

Darsning o'z nomi yo'qolmaydi — u `lessons.topic` ustunida, mavzuga
bog'liq emas. Darslar endi sana bo'yicha tartiblanadi.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8e5f1a3c927'
down_revision: Union[str, Sequence[str], None] = 'a7d4e2c81b95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if "topic_id" in {column["name"] for column in inspector.get_columns("lessons")}:
        for foreign_key in inspector.get_foreign_keys("lessons"):
            if foreign_key.get("constrained_columns") == ["topic_id"] and foreign_key.get("name"):
                op.drop_constraint(foreign_key["name"], "lessons", type_="foreignkey")
        if "ix_lessons_topic_id" in {index["name"] for index in inspector.get_indexes("lessons")}:
            op.drop_index("ix_lessons_topic_id", table_name="lessons")
        op.drop_column("lessons", "topic_id")

    if "course_topics" in inspector.get_table_names():
        op.drop_table("course_topics")


def downgrade() -> None:
    # Mavzularning o'zini qaytarib bo'lmaydi — faqat tuzilishi tiklanadi.
    op.create_table(
        "course_topics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("topic_type", sa.String(length=20), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_course_topics_course_id", "course_topics", ["course_id"], unique=False)
    op.add_column("lessons", sa.Column("topic_id", sa.Integer(), nullable=True))
    op.create_index("ix_lessons_topic_id", "lessons", ["topic_id"], unique=False)
    op.create_foreign_key(
        "fk_lessons_topic_id", "lessons", "course_topics", ["topic_id"], ["id"], ondelete="SET NULL"
    )
