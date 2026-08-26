"""Привязка студента к группе на входе через Hemis.

Оргструктура — зеркало EPOS, поэтому Hemis в ней ничего не заводит: раньше
``get_or_create`` создавал недостающую группу (и факультет) под именем из Hemis,
и рядом с приехавшей из EPOS «33a-25 KEM» появлялась вторая «33a 25 kem» мимо
зеркала. Теперь группу только находят.

Ключевая тонкость — регистр. Сопоставление приводит имя из Hemis к нижнему
регистру, а EPOS отдаёт название как есть, поэтому сравнивать нужно тоже по
нижнему регистру; иначе точная ветка не срабатывает никогда.
"""

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.modules.organization_structure.group.repository import get_group_repository
from app.modules.organization_structure.model import Faculty, Group


@pytest_asyncio.fixture
async def faculty(async_db):
    row = Faculty(name="Konchilik")
    async_db.add(row)
    await async_db.flush()
    return row


async def _make_group(session, faculty_id: int, name: str) -> Group:
    group = Group(name=name, faculty_id=faculty_id)
    session.add(group)
    await session.flush()
    return group


@pytest.mark.asyncio
async def test_missing_group_is_not_created(async_db, faculty):
    """Группы нет в зеркале — студент остаётся без привязки, строка не заводится."""
    before = (await async_db.execute(select(func.count()).select_from(Group))).scalar()

    group = await get_group_repository.resolve_for_hemis(async_db, "5501", "77z-99 XXX")

    assert group is None
    after = (await async_db.execute(select(func.count()).select_from(Group))).scalar()
    assert after == before


@pytest.mark.asyncio
async def test_name_match_ignores_case_and_is_remembered(async_db, faculty):
    """Совпадение по имени срабатывает при разном регистре и запоминается по id."""
    existing = await _make_group(async_db, faculty.id, "33a-25 KEM")

    group = await get_group_repository.resolve_for_hemis(async_db, "1105", "33a-25 KEM")

    assert group is not None
    assert group.id == existing.id
    assert group.hemis_group_id == "1105"


@pytest.mark.asyncio
async def test_renamed_group_is_still_found_by_hemis_id(async_db, faculty):
    """После привязки имя больше не важно: ключ — идентификатор Hemis."""
    existing = await _make_group(async_db, faculty.id, "33a-25 KEM")
    existing.hemis_group_id = "1105"
    await async_db.flush()

    group = await get_group_repository.resolve_for_hemis(async_db, "1105", "совсем другое имя")

    assert group is not None
    assert group.id == existing.id


@pytest.mark.asyncio
async def test_ambiguous_name_is_left_to_admin(async_db, async_db_engine):
    """Двум одноимённым группам не достаётся привязка вслепую."""
    first = Faculty(name="Konchilik")
    second = Faculty(name="Energo-mexanika")
    async_db.add_all([first, second])
    await async_db.flush()

    await _make_group(async_db, first.id, "33a-25 KEM")
    await _make_group(async_db, second.id, "33a-25 KEM")

    group = await get_group_repository.resolve_for_hemis(async_db, "1105", "33a-25 KEM")

    assert group is None
    bound = (
        await async_db.execute(select(func.count()).select_from(Group).where(Group.hemis_group_id.is_not(None)))
    ).scalar()
    assert bound == 0


@pytest.mark.asyncio
async def test_preview_does_not_write(async_db, faculty):
    """Предпросмотр в админке только читает — идентификатор не проставляется."""
    existing = await _make_group(async_db, faculty.id, "33a-25 KEM")

    group = await get_group_repository.resolve_for_hemis(async_db, "1105", "33a-25 KEM", remember=False)

    assert group is not None
    assert group.id == existing.id
    assert existing.hemis_group_id is None
