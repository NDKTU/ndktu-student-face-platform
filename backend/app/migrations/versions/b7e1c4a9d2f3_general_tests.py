"""Umumiy test (общий тест) — отдельные таблицы

Простой тест без предмета, лектора и группы: вопросы с четырьмя вариантами
принадлежат самому тесту, проходит его любой пользователь, результаты
хранятся отдельно от `results` и в академическую статистику не попадают.

Право `general_test:take` создаётся здесь же и выдаётся всем существующим
ролям — «тест для всех» не должен ждать, пока админ пройдётся по ролям
вручную. Остальные права (`*:general_test`, `*:general_test_result`)
появятся при старте приложения и достанутся только Admin.

Revision ID: b7e1c4a9d2f3
Revises: 3a5c449578cf
Create Date: 2026-10-01 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b7e1c4a9d2f3"
down_revision: Union[str, Sequence[str], None] = "3a5c449578cf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "general_tests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration", sa.Integer(), server_default="30", nullable=False),
        sa.Column("attempt_limit", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "general_test_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("test_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("option_a", sa.Text(), nullable=False),
        sa.Column("option_b", sa.Text(), nullable=False),
        sa.Column("option_c", sa.Text(), nullable=False),
        sa.Column("option_d", sa.Text(), nullable=False),
        sa.Column("correct_option", sa.String(length=1), server_default="a", nullable=False),
        sa.Column("order", sa.Integer(), server_default="0", nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["test_id"], ["general_tests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_general_test_questions_test_id", "general_test_questions", ["test_id"])

    op.create_table(
        "general_test_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("test_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="in_progress", nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("layout", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("total_questions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("correct_answers", sa.Integer(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["test_id"], ["general_tests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_general_test_attempts_test_id", "general_test_attempts", ["test_id"])
    op.create_index("ix_general_test_attempts_user_id", "general_test_attempts", ["user_id"])

    op.create_table(
        "general_test_answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attempt_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("selected_option", sa.String(length=1), nullable=False),
        sa.Column("is_correct", sa.Boolean(), server_default="false", nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["attempt_id"], ["general_test_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["general_test_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", "question_id", name="uq_general_test_answer"),
    )
    op.create_index("ix_general_test_answers_attempt_id", "general_test_answers", ["attempt_id"])

    op.execute(
        """
        INSERT INTO permissions (name, created_at, updated_at)
        VALUES ('general_test:take', now(), now())
        ON CONFLICT (name) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name = 'general_test:take'
        WHERE NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions rp
        USING permissions p
        WHERE rp.permission_id = p.id
        AND (p.name = 'general_test:take' OR p.name LIKE '%:general_test' OR p.name LIKE '%:general_test_result')
        """
    )
    op.execute(
        """
        DELETE FROM permissions
        WHERE name = 'general_test:take' OR name LIKE '%:general_test' OR name LIKE '%:general_test_result'
        """
    )
    op.drop_index("ix_general_test_answers_attempt_id", table_name="general_test_answers")
    op.drop_table("general_test_answers")
    op.drop_index("ix_general_test_attempts_user_id", table_name="general_test_attempts")
    op.drop_index("ix_general_test_attempts_test_id", table_name="general_test_attempts")
    op.drop_table("general_test_attempts")
    op.drop_index("ix_general_test_questions_test_id", table_name="general_test_questions")
    op.drop_table("general_test_questions")
    op.drop_table("general_tests")
