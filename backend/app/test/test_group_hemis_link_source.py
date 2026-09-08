"""Кто главнее в привязке группы к HEMIS: EPOS или администратор.

Связка `groups.hemis_group_id` решает, в какую группу приедут студенты при
импорте. EPOS отдаёт свой `hemis_id` заполненным не везде и не всегда верно,
поэтому расхождения разбирает человек — на экране сопоставления, где видно и
голоса уже привязанных студентов, и похожие названия. Раньше следующий прогон
EduPlan молча переписывал это решение, и на ближайшем импорте студенты
переезжали в чужую группу.
"""

import pytest
import pytest_asyncio
from core.mixins.external_ref import SOURCE_EDUPLAN

from app.modules.integration.eduplan.repository import eduplan_repository
from app.modules.organization_structure.model import Faculty, Group

EXTERNAL_ID = "eduplan-group-77"


@pytest_asyncio.fixture
async def faculty(async_db):
    row = Faculty(name="Konchilik")
    async_db.add(row)
    await async_db.flush()
    return row


async def _mirrored_group(session, faculty_id: int, **overrides) -> Group:
    group = Group(
        name="23G-26 MET",
        faculty_id=faculty_id,
        external_id=EXTERNAL_ID,
        external_source=SOURCE_EDUPLAN,
    )
    for key, value in overrides.items():
        setattr(group, key, value)
    session.add(group)
    await session.flush()
    return group


async def _upsert(session, group: Group, hemis_group_id: str | None):
    return await eduplan_repository.upsert_group(
        session,
        external_id=EXTERNAL_ID,
        name=group.name,
        faculty_id=group.faculty_id,
        speciality_id=None,
        course=None,
        education_shape=None,
        student_count=None,
        existing=group,
        hemis_group_id=hemis_group_id,
    )


@pytest.mark.asyncio
async def test_manual_link_survives_eduplan_sync(async_db, faculty):
    """Разобранную вручную связку EPOS не перебивает своим значением."""
    group = await _mirrored_group(
        async_db, faculty.id, hemis_group_id="1424", hemis_group_id_source="manual"
    )

    await _upsert(async_db, group, hemis_group_id="9999")

    assert group.hemis_group_id == "1424"
    assert group.hemis_group_id_source == "manual"


@pytest.mark.asyncio
async def test_eduplan_fills_unclaimed_link(async_db, faculty):
    """Там, где решения администратора не было, EPOS по-прежнему хозяин."""
    group = await _mirrored_group(async_db, faculty.id)

    await _upsert(async_db, group, hemis_group_id="9999")

    assert group.hemis_group_id == "9999"
    assert group.hemis_group_id_source == "eduplan"


@pytest.mark.asyncio
async def test_empty_value_never_clears_the_link(async_db, faculty):
    """Пустой `hemis_id` на стороне EPOS — не повод терять известную связку."""
    group = await _mirrored_group(
        async_db, faculty.id, hemis_group_id="1424", hemis_group_id_source="eduplan"
    )

    await _upsert(async_db, group, hemis_group_id=None)

    assert group.hemis_group_id == "1424"
