"""Rollar: tizim kaliti `roles.code`

Kod rolni nomidan tanirdi (`role.name.lower() == "admin"`), nom esa admin
interfeysidan o'zgaradi. Endi uchta tizim roli — admin, teacher, student —
o'zgarmas `code` oladi, qolgan rollarda u bo'sh.

Bir xil nomli (registri farq qiladigan) ikkita rol bo'lsa, kod eng eskisiga
beriladi — qisman unikal indeks ikkinchisiga yo'l qo'ymaydi.

Revision ID: a8c4e2f7b1d3
Revises: f3b7d1e9a2c6
Create Date: 2026-10-16 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8c4e2f7b1d3"
down_revision: Union[str, Sequence[str], None] = "f3b7d1e9a2c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("roles", sa.Column("code", sa.String(length=20), nullable=True))
    for code in ("admin", "teacher", "student"):
        op.execute(
            f"""
            UPDATE roles SET code = '{code}'
            WHERE id = (SELECT min(id) FROM roles WHERE lower(trim(name)) = '{code}')
            """
        )
    op.create_index(
        "uq_roles_code", "roles", ["code"], unique=True, postgresql_where=sa.text("code IS NOT NULL")
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_roles_code", table_name="roles", postgresql_where=sa.text("code IS NOT NULL"))
    op.drop_column("roles", "code")
