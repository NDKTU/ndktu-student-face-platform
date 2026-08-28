"""Savol rasmlari havolalarini tuzatish

Bazadagi barcha rasm havolalari eski domenga qotib qolgan:
`https://test.api.nsumt.uz/uploads/questions/<uuid>.png`. Domen almashgach
(2026-04-27) bu havolalar ishlamay qoldi — fayllar joyida bo'lsa ham brauzer
mavjud bo'lmagan hostga so'rov yuboradi.

Ikkita narsa tuzatiladi:
  1. Domen olib tashlanadi — havola nisbiy bo'ladi (`/uploads/...`). Nisbiy
     havola frontend nginx orqali backend'ga o'tadi va keyingi domen
     almashinuvidan omon qoladi.
  2. `questions` (ko'plik) o'rniga `question` — rasmlar aslida
     `uploads/question/` papkasida yotadi, `/uploads/questions/` esa main.py
     dagi legacy alias edi.

Revision ID: b7d41e0c92aa
Revises: e9a4b71c3f26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7d41e0c92aa"
down_revision: Union[str, Sequence[str], None] = "e9a4b71c3f26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Qaysi jadval va ustunlarda HTML matn (va uning ichida <img src>) saqlanadi.
TARGETS: dict[str, tuple[str, ...]] = {
    "questions": ("text", "option_a", "option_b", "option_c", "option_d"),
    "user_answers": ("answer", "correct_answer"),
}

# Avval to'liq havola (host bilan), keyin nisbiy shakl. Tartib muhim: birinchi
# almashtirishdan keyin natijada `/uploads/question/` (birlik) qoladi, uni
# ikkinchi naqsh (`questions`, ko'plik) endi ushlamaydi — ya'ni ikki marta
# almashtirib yuborilmaydi.
PATTERNS: tuple[str, ...] = (
    r"https?://[^/]*/uploads/questions/",
    r"/uploads/questions/",
)

REPLACEMENT = "/uploads/question/"


def upgrade() -> None:
    conn = op.get_bind()
    for table, columns in TARGETS.items():
        for column in columns:
            for pattern in PATTERNS:
                conn.execute(
                    sa.text(
                        f"UPDATE {table} "
                        f"SET {column} = regexp_replace({column}, :pattern, :replacement, 'g') "
                        f"WHERE {column} LIKE '%/uploads/questions/%'"
                    ),
                    {"pattern": pattern, "replacement": REPLACEMENT},
                )


def downgrade() -> None:
    # Qaytarib bo'lmaydi: eski domen (`test.api.nsumt.uz`) allaqachon
    # ishlamaydi, tuzatilgan havolalarni unga qaytarish faqat zarar keltiradi.
    # Bundan tashqari yangi yuklangan rasmlar ham `/uploads/question/` da
    # yotadi — ularni eski shaklga o'tkazib bo'lmaydi.
    pass
