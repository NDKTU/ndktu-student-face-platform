"""EPMOS: band `hemis_id` butun sinxronizatsiyani toʻxtatmaydi.

Serverda «Oʻqituvchilarni sinxronlash» 500 bilan tushardi. Sabab:
EPMOS bir xodimga ayni `hemis_id` ni berib qoʻygan, u esa boshqa
mahalliy qatorda band edi; `UPDATE` qisman unikal indeksga
(`uq_teachers_hemis_id`) urilgan.

Ikkita kamchilik bir vaqtda ochildi:

1. `hemis_id` koʻr-koʻrona yozilardi;
2. bitta qatordagi `IntegrityError` dan keyin SESSIYA buzilib, keyingi
   har bir amal `PendingRollbackError` berardi — `_apply_one` dagi
   `except` buni ushlay olmasdi va progon 500 bilan tugardi.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.auth.model import Teacher, User
from app.modules.integration.eduplan.repository import eduplan_repository


async def _make_teacher(async_db, *, username: str, hemis_id: str | None, external_id: str) -> Teacher:
    user = User(username=username, password="x")
    async_db.add(user)
    await async_db.flush()
    teacher = Teacher(
        user_id=user.id,
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name=f"Familiya Ism ({username})",
        hemis_id=hemis_id,
        external_id=external_id,
        external_source="eduplan",
    )
    async_db.add(teacher)
    await async_db.commit()
    await async_db.refresh(teacher)
    return teacher


@pytest_asyncio.fixture
async def two_mirrored_teachers(async_db):
    first = await _make_teacher(async_db, username="epos_a", hemis_id="HEMIS-1", external_id="1001")
    second = await _make_teacher(async_db, username="epos_b", hemis_id=None, external_id="1002")
    return {"first": first, "second": second}


@pytest.mark.asyncio
async def test_taken_hemis_id_is_not_written(async_db, two_mirrored_teachers):
    """Band `hemis_id` yozilmaydi, qolgan maydonlar yangilanadi."""
    second = two_mirrored_teachers["second"]

    row = await eduplan_repository.upsert_teacher(
        async_db,
        external_id="1002",
        username="epos_b",
        hemis_id="HEMIS-1",  # ← birinchi oʻqituvchida band
        first_name="Yangi",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Yangi Familiya",
        kafedra_id=None,
        existing=second,
    )
    await async_db.commit()

    assert row.hemis_id is None, "band qiymat yozilmasligi kerak"
    assert row.full_name == "Yangi Familiya", "qolgan maydonlar yangilanadi"
    # Birinchi oʻqituvchining bogʻlanishi tegilmaydi.
    first = await async_db.get(Teacher, two_mirrored_teachers["first"].id)
    await async_db.refresh(first)
    assert first.hemis_id == "HEMIS-1"


@pytest.mark.asyncio
async def test_blank_hemis_id_becomes_null(async_db, two_mirrored_teachers):
    """Boʻsh satr — «maʼlumot yoʻq», indeks uchun esa haqiqiy qiymat.

    Ikki xodim boʻsh satr bilan kelsa, ikkinchisi indeksga urilardi.
    """
    second = two_mirrored_teachers["second"]

    row = await eduplan_repository.upsert_teacher(
        async_db,
        external_id="1002",
        username="epos_b",
        hemis_id="   ",
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Familiya Ism",
        kafedra_id=None,
        existing=second,
    )
    await async_db.commit()

    assert row.hemis_id is None


@pytest.mark.asyncio
async def test_own_hemis_id_is_kept(async_db, two_mirrored_teachers):
    """Oʻzining qiymati band deb hisoblanmaydi."""
    first = two_mirrored_teachers["first"]

    row = await eduplan_repository.upsert_teacher(
        async_db,
        external_id="1001",
        username="epos_a",
        hemis_id="HEMIS-1",
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Yangilangan nom",
        kafedra_id=None,
        existing=first,
    )
    await async_db.commit()

    assert row.hemis_id == "HEMIS-1"
    assert row.full_name == "Yangilangan nom"


@pytest.mark.asyncio
async def test_new_hemis_id_is_written(async_db, two_mirrored_teachers):
    """Band boʻlmagan qiymat odatdagidek yoziladi."""
    second = two_mirrored_teachers["second"]

    row = await eduplan_repository.upsert_teacher(
        async_db,
        external_id="1002",
        username="epos_b",
        hemis_id="HEMIS-2",
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Familiya Ism",
        kafedra_id=None,
        existing=second,
    )
    await async_db.commit()

    assert row.hemis_id == "HEMIS-2"
    saved = (
        await async_db.execute(select(Teacher.hemis_id).where(Teacher.id == row.id))
    ).scalar_one()
    assert saved == "HEMIS-2"
