"""Nom boʻyicha unikallik faqat qoʻlda kiritilgan satrlarga

EduPlan bilan sinxronizatsiya shu xato bilan toʻxtardi:

    duplicate key value violates unique constraint "uq_subjects_kafedra_id_name"
    Key (kafedra_id, name)=(22, Eksperimentni tashkil etish va rejalashtirish)
    already exists

Sabab tuzilmaviy. Bizda «bitta kafedrada bir xil nomli ikki fan boʻlmaydi»
degan qoida bor edi, EduPlan'da esa bunday cheklov yoʻq: oʻsha kafedrada
bir xil nomli ikkita fan bor, `external_id` 1452 va 2491. Ular EduPlan
uchun turli fanlar, biz uchun esa bittasi ikkinchisining dublikati.

Koʻzgu satrining oʻziga xosligini nom emas, `(external_source, external_id)`
belgilaydi — bu indeks (`uq_*_external_ref`) allaqachon bor. Yaʼni nom
boʻyicha cheklov koʻzgu satrlariga umuman kerak emas va faqat zarar keltiradi:
u butun prognni toʻxtatadi.

Shuning uchun cheklov qisman indeksga aylantiriladi: `WHERE external_source
IS NULL`. Qoʻlda kiritilgan satrlar uchun qoida oʻz kuchida qoladi —
administrator bir xil nomli ikki kafedra yarata olmaydi.

Beshta jadvalning hammasi bir vaqtda oʻzgartiriladi. Bugun faqat `subjects`
da koʻzgu satrlari bor, lekin sinxronizatsiya guruh va mutaxassisliklarni
ham koʻchira boshlaydi va oʻsha devorga qaytadan urilardi.

Diqqat: bundan keyin roʻyxatlarda bir xil nomli ikki fan koʻrinishi mumkin.
Bu EduPlan'dagi haqiqat; satrni qabul qilmaslik esa butun sinxronizatsiyani
oʻldiradi.

Revision ID: c5f30ab71d92
Revises: 8a1ef9064485
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c5f30ab71d92"
down_revision: Union[str, Sequence[str], None] = "8a1ef9064485"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: (jadval, eski cheklov nomi, ustunlar) — yangi qisman indeks nomi
#: eski nomdan olinadi, shunda kod va migratsiyalarda qidirish oson.
TARGETS = [
    ("faculties", "faculties_name_key", ["name"]),
    ("kafedras", "uq_kafedras_faculty_id_name", ["faculty_id", "name"]),
    ("specialities", "uq_specialities_kafedra_id_name", ["kafedra_id", "name"]),
    ("groups", "uq_groups_faculty_id_name", ["faculty_id", "name"]),
    ("subjects", "uq_subjects_kafedra_id_name", ["kafedra_id", "name"]),
]


def upgrade() -> None:
    for table, constraint, columns in TARGETS:
        op.drop_constraint(constraint, table, type_="unique")
        op.create_index(
            constraint,
            table,
            columns,
            unique=True,
            postgresql_where=sa.text("external_source IS NULL"),
        )


def downgrade() -> None:
    # Ortga qaytarish koʻzgu satrlarida nom dublikatlari boʻlmaganda ishlaydi.
    # Ular paydo boʻlgan boʻlsa, avval qoʻlda hal qilish kerak — jimgina
    # oʻchirib yuborish maʼlumot yoʻqotish demakdir.
    for table, constraint, columns in TARGETS:
        op.drop_index(constraint, table_name=table)
        op.create_unique_constraint(constraint, table, columns)
