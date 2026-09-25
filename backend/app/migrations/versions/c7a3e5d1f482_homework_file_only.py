"""Uy vazifasi javobi — faqat fayl (PDF yoki rasm)

Talaba endi matn yozmaydi va faqat PDF yoki rasm yuklaydi; o'qituvchi
formasida bu sozlama yo'q. Mavjud vazifalar ham shu qoidaga keltiriladi,
aks holda eski vazifada talabaga matn maydoni va boshqa turlar ko'rinardi.

Revision ID: c7a3e5d1f482
Revises: b4e7c2f9a613
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c7a3e5d1f482"
down_revision: Union[str, Sequence[str], None] = "b4e7c2f9a613"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE homeworks
        SET allow_file = true,
            allow_text = false,
            allowed_file_types = '["pdf", "jpg,jpeg,png"]'::jsonb
        """
    )


def downgrade() -> None:
    # Avvalgi sozlamalar saqlanmagan — qaytariladigan narsa yo'q.
    pass
