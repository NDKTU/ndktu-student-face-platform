"""Elementar test: savollar testdan fanga ko'chadi

Savol endi fanning bankida turadi (`general_test_questions.subject_id`), fan
testlari undan tasodifiy `question_number` tasini oladi. Mavjud savollar o'z
testining faniga o'tadi — ya'ni bir fandagi bir nechta testning savollari
bitta bankka qo'shiladi.

Urinishlar (`layout`) va javoblar savolga id orqali bog'langan, savol
qatorlari esa saqlanadi — natijalar buzilmaydi.

Orqaga qaytarishda har bir savol o'z fanidagi birinchi testga beriladi;
testi yo'q fanning savollari o'chadi.

Revision ID: a8e3f5c1d7b2
Revises: f1c9d4e7a2b6
Create Date: 2026-10-02 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a8e3f5c1d7b2"
down_revision: Union[str, Sequence[str], None] = "f1c9d4e7a2b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("general_test_questions", sa.Column("subject_id", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE general_test_questions q
        SET subject_id = t.subject_id
        FROM general_tests t
        WHERE t.id = q.test_id
        """
    )
    op.alter_column("general_test_questions", "subject_id", nullable=False)
    op.create_foreign_key(
        "general_test_questions_subject_id_fkey",
        "general_test_questions",
        "general_test_subjects",
        ["subject_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_general_test_questions_subject_id", "general_test_questions", ["subject_id"])

    op.drop_index("ix_general_test_questions_test_id", table_name="general_test_questions")
    op.drop_column("general_test_questions", "test_id")


def downgrade() -> None:
    op.add_column("general_test_questions", sa.Column("test_id", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE general_test_questions q
        SET test_id = (
            SELECT min(t.id) FROM general_tests t WHERE t.subject_id = q.subject_id
        )
        """
    )
    op.execute("DELETE FROM general_test_questions WHERE test_id IS NULL")
    op.alter_column("general_test_questions", "test_id", nullable=False)
    op.create_foreign_key(
        "general_test_questions_test_id_fkey",
        "general_test_questions",
        "general_tests",
        ["test_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_general_test_questions_test_id", "general_test_questions", ["test_id"])

    op.drop_index("ix_general_test_questions_subject_id", table_name="general_test_questions")
    op.drop_column("general_test_questions", "subject_id")
