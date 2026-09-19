"""group education language

EPMOS guruhda ta'lim tilini (`uzbek` / `russian`) saqlaydi, biz esa uni
o'qimasdan tashlab yuborardik. Natijada kurs yig'ishda rus guruhi o'zbek
guruhlari bilan bitta kursga tushardi — dars tili boshqa bo'lsa ham.

Ustun bo'sh bo'lishi mumkin: qo'lda kiritilgan guruhlarda til yo'q, EPMOS
guruhlari esa keyingi sinxronizatsiyada to'ladi.

Revision ID: f2a9d4c7b1e3
Revises: d4b7c1e93a2f
Create Date: 2026-09-19

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a9d4c7b1e3"
down_revision: Union[str, Sequence[str], None] = "d4b7c1e93a2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("education_language", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("groups", "education_language")
