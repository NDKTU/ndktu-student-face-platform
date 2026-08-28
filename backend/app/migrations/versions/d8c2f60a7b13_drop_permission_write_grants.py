"""Ruxsatlarni qo'lda o'zgartirish olib tashlandi

Ruxsatlar route'lardagi ``PermissionRequired(...)`` dan ilova ishga tushganda
topiladi, ya'ni ular kod bilan belgilanadi. Shu sababli ``POST/PUT/DELETE
/permission`` endpoint'lari o'chirildi, ularga tegishli grantlar esa bazada
qolib ketmasligi kerak.

``55ff8e93c6a6`` xuddi shu qatorlarni o'chirgan edi, lekin route'lar joyida
qolgani uchun keyingi har bir ishga tushishda ular qaytadan yaratilardi.

Revision ID: d8c2f60a7b13
Revises: c7f1a94b28e5
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d8c2f60a7b13"
down_revision: Union[str, Sequence[str], None] = "c7f1a94b28e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """role_permissions FK'si ON DELETE CASCADE — grantlar o'zi tozalanadi."""
    op.execute("DELETE FROM permissions WHERE name IN ('create:permission', 'update:permission', 'delete:permission')")


def downgrade() -> None:
    """Route'lar qaytarilsa, ruxsatlarni startdagi discovery qayta yaratadi."""
