"""add course_topics.topic_type

Mashg'ulot turi (ma'ruza / laboratoriya / seminar) mavzu darajasiga
ko'chirildi: o'qituvchi mavzu ochayotganda turini tanlaydi, mavzu ichidagi
darslar esa o'sha turni meros qilib oladi.

Eski mavzular NULL bilan qoladi — turi noma'lum mavzuni taxmin bilan
«ma'ruza» deb belgilash o'quv rejadagi soatlar taqsimotini buzardi.

Revision ID: e4a1c7b93d20
Revises: fc0cf636df71
Create Date: 2026-09-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4a1c7b93d20'
down_revision: Union[str, Sequence[str], None] = 'fc0cf636df71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('course_topics', sa.Column('topic_type', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('course_topics', 'topic_type')
