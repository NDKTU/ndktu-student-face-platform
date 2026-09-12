"""Shaxsiy papka belgisi

Revision ID: e7c4b2a91f58
Revises: d4a1c7e930b2
Create Date: 2026-09-12

Birinchi fayl yuklanganda foydalanuvchiga avtomatik papka ochiladi va
keyingi yuklashlar ham o'sha papkaga tushadi. Belgi kerak, chunki keyingi
yuklash aynan shu papkani topishi shart: nom bo'yicha izlash ishonchsiz —
foydalanuvchi papka nomini o'zgartirsa, tizim uni topa olmay har safar
yangi "shaxsiy" papka yaratardi.

Mavjud papkalar qo'lda yaratilgan, shuning uchun hammasi `false` bo'lib
qoladi: birinchi yuklashda har kimga o'z papkasi ochiladi, eskilari esa
joyida qolib, avvalgidek ishlaydi.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7c4b2a91f58"
down_revision: Union[str, Sequence[str], None] = "d4a1c7e930b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "file_folders",
        sa.Column("is_personal", sa.Boolean(), server_default="false", nullable=False),
    )
    # Bitta foydalanuvchida bitta shaxsiy papka. Qisman indeks: qo'lda
    # yaratilgan papkalar (`is_personal = false`) soni cheklanmaydi.
    op.create_index(
        "uq_file_folders_personal",
        "file_folders",
        ["owner_user_id"],
        unique=True,
        postgresql_where=sa.text("is_personal"),
    )


def downgrade() -> None:
    op.drop_index("uq_file_folders_personal", table_name="file_folders")
    op.drop_column("file_folders", "is_personal")
