"""Savolni darsga bogʻlash

`questions.lesson_id` — savol qaysi darsda qoʻshilgani. Boʻsh qiymat
«fan bankidagi umumiy savol» degani, yaʼni bu ustun paydo boʻlishidan
oldingi barcha savollar oʻz joyida qoladi.

`SET NULL`: dars oʻchirilsa savol bankda qoladi — unga eski testlar va
natijalar tayanadi.

Revision ID: 8fb9acdf3e2a
Revises: 207e0c71cd8f
Create Date: 2026-10-01 10:55:16.047545

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8fb9acdf3e2a'
down_revision: Union[str, Sequence[str], None] = '207e0c71cd8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# DIQQAT: autogenerate har safar `uq_file_folders_personal` ni oʻchirishni
# taklif qiladi. Bu qisman indeks (`WHERE is_personal`) va Alembic uni
# modeldagi taʼrif bilan solishtira olmay, «ortiqcha» deb hisoblaydi.
# Oʻchirilsa, har bir foydalanuvchida bittadan shaxsiy papka boʻlishi
# kafolati yoʻqoladi — shuning uchun bu yerdan ataylab olib tashlangan.


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('questions', sa.Column('lesson_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_questions_lesson_id'), 'questions', ['lesson_id'], unique=False)
    op.create_foreign_key(
        'fk_questions_lesson_id_lessons',
        'questions',
        'lessons',
        ['lesson_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_questions_lesson_id_lessons', 'questions', type_='foreignkey')
    op.drop_index(op.f('ix_questions_lesson_id'), table_name='questions')
    op.drop_column('questions', 'lesson_id')
