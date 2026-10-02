"""Elementar test: bitta urinishdagi savollar soni

`general_tests.question_number` — urinishga testning barcha savollaridan
tasodifiy nechtasi beriladi. NULL — hammasi, ya'ni mavjud testlar avvalgidek
ishlaydi.

Revision ID: f1c9d4e7a2b6
Revises: e4a7c2b81f05
Create Date: 2026-10-02 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1c9d4e7a2b6"
down_revision: Union[str, Sequence[str], None] = "e4a7c2b81f05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("general_tests", sa.Column("question_number", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("general_tests", "question_number")
