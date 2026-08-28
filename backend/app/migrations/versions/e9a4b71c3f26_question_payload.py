"""Savol turlari uchun `questions.payload`

Yangi turlar (to'g'ri/noto'g'ri, bir nechta to'g'ri javob) `option_a..d` va
bitta harfli `correct_option` shakliga sig'maydi. Ular JSONB ustunda
saqlanadi, eski `QUIZ` turi esa o'z ustunlarida qoladi: bazada 64 mingdan
ortiq savol bor, ularni ko'chirish versiyalash zanjirini buzardi.

    TRUE_FALSE   -> {"correct": true}
    MULTI_SELECT -> {"options": ["...", "..."], "correct": [0, 2]}

Revision ID: e9a4b71c3f26
Revises: d8c2f60a7b13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e9a4b71c3f26"
down_revision: Union[str, Sequence[str], None] = "d8c2f60a7b13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("questions", sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("questions", "payload")
