"""normalize structure names to lowercase

База хранит каноническую форму названия (нижний регистр, схлопнутые пробелы),
красивое написание рисует фронтенд. До этого «Konchilik», «KONCHILIK» и
«konchilik  » были тремя разными факультетами, а карточки выглядели вразнобой.

Revision ID: d1e4a7c93b02
Revises: cce17e025350
Create Date: 2026-07-31

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1e4a7c93b02"
down_revision: Union[str, None] = "cce17e025350"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("faculties", "kafedras", "specialities")

# Схлопываем пробелы и опускаем регистр — тем же правилом, что `normalized_name`
# в app/core/schemas.py.
NORMALIZED = "lower(btrim(regexp_replace(name, '\\s+', ' ', 'g')))"


def upgrade() -> None:
    conn = op.get_bind()

    # Названия во всех трёх таблицах UNIQUE. Если «Konchilik» и «konchilik»
    # уже сосуществуют, UPDATE упадёт нарушением уникальности с невнятной
    # ошибкой — лучше остановиться заранее и назвать конкретные строки.
    collisions = []
    for table in TABLES:
        rows = conn.execute(
            sa.text(
                f"SELECT {NORMALIZED} AS canonical, count(*) AS n "
                f"FROM {table} GROUP BY 1 HAVING count(*) > 1"
            )
        ).fetchall()
        collisions += [f"{table}: {row.canonical!r} ({row.n} ta)" for row in rows]

    if collisions:
        raise RuntimeError(
            "Nomlarni kichik harfga o'tkazib bo'lmadi — quyidagilar bir xil "
            "bo'lib qoladi, avval qo'lda tuzating:\n  " + "\n  ".join(collisions)
        )

    for table in TABLES:
        op.execute(f"UPDATE {table} SET name = {NORMALIZED} WHERE name <> {NORMALIZED}")


def downgrade() -> None:
    # Исходный регистр не сохранён, восстановить его нечем. Ставим первую
    # букву заглавной — это ближе к тому, что было, чем ничего.
    for table in TABLES:
        op.execute(
            f"UPDATE {table} SET name = upper(left(name, 1)) || substr(name, 2) WHERE name <> ''"
        )
