"""Semestr nomlari: «1/2» o'rniga «kuzgi» va «bahorgi»

Universitetda semestrlar raqam bilan emas, nom bilan ataladi. Yangi
sarlavhalarni `semester_label` yig'adi, bu migratsiya esa allaqachon
saqlangan test sarlavhalari va kurs nomlarini bir ko'rinishga keltiradi —
aks holda ro'yxatda ikki xil yozuv aralashib turardi.

Faqat sarlavha oxiridagi qavs almashtiriladi, boshqa matnga tegilmaydi.

Revision ID: d4f7a91c26b3
Revises: c9e1b3d47f52
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d4f7a91c26b3"
down_revision: Union[str, Sequence[str], None] = "c9e1b3d47f52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RENAMES = (
    ("(1-semestr)", "(kuzgi semestr)"),
    ("(2-semestr)", "(bahorgi semestr)"),
)


def _apply(pairs) -> None:
    for table, column in (("quizzes", "title"), ("courses", "name")):
        for old, new in pairs:
            op.execute(
                f"""
                UPDATE {table}
                SET {column} = replace({column}, '{old}', '{new}')
                WHERE {column} LIKE '%{old}'
                """
            )


def upgrade() -> None:
    _apply(_RENAMES)


def downgrade() -> None:
    _apply([(new, old) for old, new in _RENAMES])
