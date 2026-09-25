"""Fayl yuklash limiti

O'qituvchining yuklagan fayllari umumiy hajmi limit bilan cheklanadi.
Limitni admin belgilaydi: umumiy (hammaga) va individual (bitta o'qituvchiga).

* `users.storage_quota_bytes` — individual limit; bo'sh bo'lsa umumiy ishlaydi.
* `app_settings` — admin interfeysdan o'zgartiriladigan sozlamalar, jumladan
  umumiy limit. Yozuv bo'lmasa `core/config.py` dagi zaxira qiymat ishlaydi.
* `file_quota_changes` — limit o'zgarishlari tarixi.

Ishlatilgan hajm saqlanmaydi — har safar `files` va `file_blobs` dan
hisoblanadi, shuning uchun bu yerda mavjud ma'lumotni ko'chirish yo'q.

Revision ID: b4e7c2f9a613
Revises: d8f1b3a52e97
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b4e7c2f9a613"
down_revision: Union[str, Sequence[str], None] = "d8f1b3a52e97"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("storage_quota_bytes", sa.BigInteger(), nullable=True))

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            name=op.f("fk_app_settings_updated_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_settings")),
        sa.UniqueConstraint("key", name=op.f("uq_app_settings_key")),
    )

    op.create_table(
        "file_quota_changes",
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("old_bytes", sa.BigInteger(), nullable=True),
        sa.Column("new_bytes", sa.BigInteger(), nullable=True),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_file_quota_changes_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by_user_id"],
            ["users.id"],
            name=op.f("fk_file_quota_changes_changed_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_file_quota_changes")),
    )
    op.create_index(
        op.f("ix_file_quota_changes_user_id"), "file_quota_changes", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_file_quota_changes_user_id"), table_name="file_quota_changes")
    op.drop_table("file_quota_changes")
    op.drop_table("app_settings")
    op.drop_column("users", "storage_quota_bytes")
