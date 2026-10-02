"""Elementar test: fanlar, fanga biriktirilgan foydalanuvchilar, test guruhlari

«Umumiy test» endi «Elementar test»: har bir test admin ochgan fanga
tegishli. Testni ko'radiganlar — fanga biriktirilgan foydalanuvchilar va
testga biriktirilgan guruhlarning talabalari.

Mavjud testlar uchun «Umumiy» degan fan ochiladi (faqat test bor bo'lsa) va
ular shunga o'tkaziladi — `subject_id` shundan keyin NOT NULL. Bu fanga hech
kim biriktirilmagan, ya'ni ilgari hammaga ochiq bo'lgan faol testlar endi
admin foydalanuvchi yoki guruh biriktirmaguncha hech kimga ko'rinmaydi.

`*:general_test_subject` ruxsatlari ishga tushishda paydo bo'ladi va faqat
Admin'ga beriladi.

Revision ID: d3f8a2c6b915
Revises: b7e1c4a9d2f3
Create Date: 2026-10-02 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3f8a2c6b915"
down_revision: Union[str, Sequence[str], None] = "b7e1c4a9d2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "general_test_subjects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "general_test_subject_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["subject_id"], ["general_test_subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subject_id", "user_id", name="uq_general_test_subject_user"),
    )
    op.create_index("ix_general_test_subject_users_subject_id", "general_test_subject_users", ["subject_id"])
    op.create_index("ix_general_test_subject_users_user_id", "general_test_subject_users", ["user_id"])

    op.create_table(
        "general_test_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("test_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["test_id"], ["general_tests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("test_id", "group_id", name="uq_general_test_group"),
    )
    op.create_index("ix_general_test_groups_test_id", "general_test_groups", ["test_id"])
    op.create_index("ix_general_test_groups_group_id", "general_test_groups", ["group_id"])

    op.add_column("general_tests", sa.Column("subject_id", sa.Integer(), nullable=True))
    op.execute(
        """
        INSERT INTO general_test_subjects (name, created_at, updated_at)
        SELECT 'Umumiy', now(), now()
        WHERE EXISTS (SELECT 1 FROM general_tests)
        """
    )
    op.execute(
        """
        UPDATE general_tests
        SET subject_id = (SELECT id FROM general_test_subjects WHERE name = 'Umumiy')
        WHERE subject_id IS NULL
        """
    )
    op.alter_column("general_tests", "subject_id", nullable=False)
    op.create_foreign_key(
        "general_tests_subject_id_fkey",
        "general_tests",
        "general_test_subjects",
        ["subject_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_general_tests_subject_id", "general_tests", ["subject_id"])


def downgrade() -> None:
    # `\:` — op.execute matnni `text()` ga o'raydi va ekranlanmagan
    # `:general_test_subject` ni bind-parametr deb o'qiydi.
    op.execute(
        r"""
        DELETE FROM role_permissions rp
        USING permissions p
        WHERE rp.permission_id = p.id AND p.name LIKE '%\:general_test_subject'
        """
    )
    op.execute(r"DELETE FROM permissions WHERE name LIKE '%\:general_test_subject'")
    op.drop_index("ix_general_tests_subject_id", table_name="general_tests")
    op.drop_constraint("general_tests_subject_id_fkey", "general_tests", type_="foreignkey")
    op.drop_column("general_tests", "subject_id")
    op.drop_index("ix_general_test_groups_group_id", table_name="general_test_groups")
    op.drop_index("ix_general_test_groups_test_id", table_name="general_test_groups")
    op.drop_table("general_test_groups")
    op.drop_index("ix_general_test_subject_users_user_id", table_name="general_test_subject_users")
    op.drop_index("ix_general_test_subject_users_subject_id", table_name="general_test_subject_users")
    op.drop_table("general_test_subject_users")
    op.drop_table("general_test_subjects")
