"""Kurs nazorati turi: quizzes.control_type

Nazorat nomi endi turidan yasaladi, savollar esa tanlangan darslardan
tashqari kursning «Test savollari» dagi shu turdagi savollardan ham olinadi.

Mavjud nazoratlarning turi nomidan tiklanadi; nomi tanilmaganlari bo'sh
qoladi — ularga «Test savollari» dan hech narsa qo'shilmaydi. Turi tiklangan
nazoratlarga shu turdagi savollar darhol bog'lanadi: aks holda ular faqat
keyingi tahrirlashda tushardi, yangilari esa darhol.

Revision ID: a6d3e9f2c1b7
Revises: e5b2d9a7c381
Create Date: 2026-10-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a6d3e9f2c1b7"
down_revision: Union[str, Sequence[str], None] = "e5b2d9a7c381"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("quizzes", sa.Column("control_type", sa.String(length=16), nullable=True))

    op.execute(
        """
        UPDATE quizzes SET control_type = CASE
            WHEN lower(title) LIKE '1-oraliq%' THEN 'ON1'
            WHEN lower(title) LIKE '2-oraliq%' THEN 'ON2'
            WHEN lower(title) LIKE '1-joriy%' THEN 'JN1'
            WHEN lower(title) LIKE '2-joriy%' THEN 'JN2'
            WHEN lower(title) LIKE 'yakuniy%' THEN 'YN'
        END
        WHERE quiz_type = 'MIDTERM'
        """
    )

    op.execute(
        """
        INSERT INTO quiz_questions (quiz_id, question_id)
        SELECT q.id, qs.id
        FROM quizzes q
        JOIN questions qs
          ON qs.course_id = q.course_id
         AND qs.control_type = q.control_type
         AND qs.is_active
         AND qs.is_latest
        WHERE q.quiz_type = 'MIDTERM'
          AND q.control_type IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM quiz_questions qq
              WHERE qq.quiz_id = q.id AND qq.question_id = qs.id
          )
        """
    )


def downgrade() -> None:
    """Downgrade schema.

    «Test savollari» dan qo'shilgan bog'lanishlar qoladi: ularni eskidan
    qo'shilganlaridan ajratib bo'lmaydi.
    """
    op.drop_column("quizzes", "control_type")
