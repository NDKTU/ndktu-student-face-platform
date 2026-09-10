"""course_type

Revision ID: a7d4e2c81b95
Revises: 3725492f159d
Create Date: 2026-09-09

Mashg'ulot turi kurs darajasiga chiqadi: kurs endi «fan + semestr +
o'qituvchi + tur» uchligi emas, to'rtligi. Ilgari kurs faqat ma'ruzachiga
yaratilardi, amaliyot va laboratoriya olib boradiganlar esa uning kursida
assistent bo'lib turardi — ya'ni o'z yuklamasi bor odam birovning kursida
mehmon edi va o'z jurnalini yurita olmasdi.

Uchala qadam bitta migratsiyada bo'lishi shart. `external_id` ga tur
qo'shilmasa, keyingi sinxronizatsiya mavjud kurslarni tanimay qoladi va
128 tasini qaytadan yaratadi.

Assistent satrlari olib tashlanadi: yangi modelda har kim o'z turidagi
kursning egasi, birovning ma'ruza kursiga kirish huquqi esa unga endi
kerak emas. Faqat EPOS kurslaridagilar o'chadi — qo'lda yaratilgan
kursdagi hammualliflik adminning qarori.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7d4e2c81b95'
down_revision: Union[str, Sequence[str], None] = '3725492f159d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("course_type", sa.String(length=20), nullable=True))

    # Mavjud kurslarning hammasi ma'ruzadan yaratilgan: builder boshqa
    # turdagi yuklamadan kurs yasamasdi.
    op.execute("UPDATE courses SET course_type = 'lecture' WHERE course_type IS NULL")

    # Ikki nuqta bind-parametr sifatida oʻqilmasligi uchun qiymat parametrda.
    op.execute(
        sa.text(
            """
            UPDATE courses
               SET external_id = external_id || :suffix
             WHERE external_source = 'eduplan'
               AND external_id IS NOT NULL
               AND external_id NOT LIKE :pattern
            """
        ).bindparams(suffix=":lecture", pattern="%:lecture")
    )

    op.execute(
        """
        DELETE FROM course_teachers ct
         USING courses c
         WHERE ct.course_id = c.id
           AND ct.role = 'assistant'
           AND c.external_source = 'eduplan'
        """
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE courses
               SET external_id = left(external_id, length(external_id) - length(:suffix))
             WHERE external_source = 'eduplan'
               AND external_id LIKE :pattern
            """
        ).bindparams(suffix=":lecture", pattern="%:lecture")
    )
    op.drop_column("courses", "course_type")
