"""O'quv rejalar jadvali

Revision ID: d4a1c7e930b2
Revises: b8e5f1a3c927
Create Date: 2026-09-10

EPMOS'dagi `edu-plans` uchun ko'zgu jadval. Boshqa spravochniklar bilan bir
xil qurilgan: `external_id`/`external_source` bilan manbaga bog'lanadi,
yo'qolgani o'chirilmaydi — `is_active = false` bo'ladi.

Mutaxassislik, kafedra va fakultet nullable: reja mutaxassisligi hali
bog'lanmagan holatda ham saqlanadi va bog'lanish keyingi prognda
to'ldiriladi. Aks holda bitta bog'lanmagan mutaxassislik butun bo'limni
to'xtatib qo'yardi.

Nom bo'yicha unikallik faqat qo'lda kiritilgan satrlarga (c5f30ab71d92
dagi kabi): EPMOS'da bir xil nomli ikki reja bo'lishi mumkin va cheklov
sinxronizatsiyani to'xtatardi.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4a1c7e930b2"
down_revision: Union[str, Sequence[str], None] = "b8e5f1a3c927"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "curriculums",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("speciality_id", sa.Integer(), nullable=True),
        sa.Column("kafedra_id", sa.Integer(), nullable=True),
        sa.Column("faculty_id", sa.Integer(), nullable=True),
        sa.Column("education_form", sa.String(length=32), nullable=True),
        sa.Column("education_type", sa.String(length=32), nullable=True),
        # ExternalRefMixin
        sa.Column("external_id", sa.String(length=64), nullable=True),
        sa.Column("external_source", sa.String(length=32), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        # HideableMixin
        sa.Column("is_hidden", sa.Boolean(), server_default="false", nullable=False),
        # TimestampMixin
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["speciality_id"], ["specialities.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["kafedra_id"], ["kafedras.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["faculty_id"], ["faculties.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_curriculums_speciality_id"), "curriculums", ["speciality_id"])
    op.create_index(op.f("ix_curriculums_kafedra_id"), "curriculums", ["kafedra_id"])
    op.create_index(op.f("ix_curriculums_faculty_id"), "curriculums", ["faculty_id"])

    op.create_index(
        "uq_curriculums_speciality_id_name",
        "curriculums",
        ["speciality_id", "name"],
        unique=True,
        postgresql_where=sa.text("external_source IS NULL"),
    )
    # `external_ref_index()` bilan bir xil: sinxronizatsiyani idempotent
    # qiladigan indeks — qayta progn ikkinchi satr yaratmaydi.
    op.create_index(
        "uq_curriculums_external_ref",
        "curriculums",
        ["external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_curriculums_external_ref", table_name="curriculums")
    op.drop_index("uq_curriculums_speciality_id_name", table_name="curriculums")
    op.drop_index(op.f("ix_curriculums_faculty_id"), table_name="curriculums")
    op.drop_index(op.f("ix_curriculums_kafedra_id"), table_name="curriculums")
    op.drop_index(op.f("ix_curriculums_speciality_id"), table_name="curriculums")
    op.drop_table("curriculums")
