"""Rollar uchun ko'rish doirasi: `roles.data_scope` va `user_data_scopes`

Ruxsat «nima qilish mumkin»ni belgilaydi, doira esa «kimning
ma'lumotini ko'rish mumkin»ni. Mavjud rollar hozirgi xatti-harakatini
saqlaydi: teacher — o'z guruhlari, student — faqat o'zi, qolganlari
(Admin, psixolog, tutor, registrator) — hammasi. Yangi rol esa
standart bo'yicha `own`: admin doirani o'zi tanlamaguncha u hech kimni
ko'rmaydi.

Revision ID: d4a8e1c6b3f2
Revises: b5e8c2f6d9a4
Create Date: 2026-10-10 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4a8e1c6b3f2"
down_revision: Union[str, Sequence[str], None] = "b5e8c2f6d9a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "roles",
        sa.Column("data_scope", sa.String(length=20), server_default=sa.text("'own'"), nullable=False),
    )
    op.execute(
        """
        UPDATE roles SET data_scope = CASE lower(name)
            WHEN 'teacher' THEN 'assigned_groups'
            WHEN 'student' THEN 'own'
            ELSE 'all'
        END
        """
    )

    op.create_table(
        "user_data_scopes",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("faculty_id", sa.Integer(), nullable=True),
        sa.Column("kafedra_id", sa.Integer(), nullable=True),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "num_nonnulls(faculty_id, kafedra_id, group_id) = 1",
            name="ck_user_data_scopes_one_target",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["faculty_id"], ["faculties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["kafedra_id"], ["kafedras.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "faculty_id",
            "kafedra_id",
            "group_id",
            name="uq_user_data_scopes_target",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index("ix_user_data_scopes_user_id", "user_data_scopes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_data_scopes_user_id", table_name="user_data_scopes")
    op.drop_table("user_data_scopes")
    op.drop_column("roles", "data_scope")
