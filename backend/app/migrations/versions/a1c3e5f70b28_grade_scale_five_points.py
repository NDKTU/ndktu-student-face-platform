"""Uy vazifasi baholari 100 ballikdan 5 ballik tizimga o'tkaziladi

Baholash universitetdagi kabi 1–5 bo'lishi kerak, 100 ballik shkala emas.
`homeworks.max_grade` ustuni saqlanadi (eski yozuvlar va API javobi unga
tayanadi), lekin qiymati endi doim 5 va sxemada shu bilan cheklangan.

Mavjud baholar proporsional qayta hisoblanadi: eski `grade / max_grade`
nisbati 1–5 oralig'iga o'tkaziladi va chetlari qirqiladi, ya'ni 0 ball ham
1 ga aylanadi — 5 ballik tizimda 0 degan baho yo'q.

Revision ID: a1c3e5f70b28
Revises: e2a4f8c15d97
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1c3e5f70b28"
down_revision: Union[str, Sequence[str], None] = "e2a4f8c15d97"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Avval baholar — ular eski `max_grade` ga bog'liq, keyin ustunning o'zi.
    op.execute(
        """
        UPDATE homework_submissions s
        SET grade = GREATEST(1, LEAST(5, ROUND(s.grade::numeric * 5 / NULLIF(h.max_grade, 0))::int))
        FROM homeworks h
        WHERE h.id = s.homework_id
          AND s.grade IS NOT NULL
          AND h.max_grade > 0
        """
    )
    op.execute("UPDATE homeworks SET max_grade = 5 WHERE max_grade <> 5")
    op.alter_column(
        "homeworks",
        "max_grade",
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default="5",
    )


def downgrade() -> None:
    # Baholarni tiklab bo'lmaydi — 5 ballik qiymatdan asl 100 ballik ballni
    # qayta hisoblash mumkin emas. Faqat shkala kengaytiriladi.
    op.alter_column(
        "homeworks",
        "max_grade",
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default="100",
    )
