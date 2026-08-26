"""Повторная синхронизация уже связанного преподавателя из EduPlan.

Регрессия, ради которой заведён файл: ``upsert_teacher`` брал учётную запись
через ``row.user`` — ленивую связь. На боевом пути ``EduPlanSyncService.apply``
строка приезжает из голого ``session.get`` в свежей сессии, связь не
подгружена, и обращение к ней падало ``MissingGreenlet`` ещё до присваивания
полей. ``_apply_one`` глотал исключение в ``result.errors``, поэтому имя,
``hemis_id`` и кафедра связанного преподавателя не обновлялись никогда, а
прогон выглядел успешным.

Тест намеренно вызывает репозиторий напрямую: сессию он получает свежую и
строку берёт тем же ``session.get``, что и ``_apply_one``. Через HTTP этот путь
не достать — ``apply`` требует снимка предпросмотра в Redis, а снимок строится
только из живого ответа EduPlan. Важно, что ``Teacher.user`` здесь НЕ
подгружается заранее: иначе тест зеленел бы и на сломанном коде.
"""

import pytest
import pytest_asyncio
from core.mixins.external_ref import SOURCE_EDUPLAN
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Role, Teacher, User
from app.modules.integration.eduplan.repository import eduplan_repository

EXTERNAL_ID = "eduplan-teacher-42"


@pytest_asyncio.fixture
async def linked_teacher(async_db):
    """Преподаватель, уже связанный с EduPlan, и роль ``teacher`` в системе."""
    async_db.add(Role(name="teacher"))

    user = User(username="eduplan_linked", password="hashed")
    async_db.add(user)
    await async_db.flush()

    teacher = Teacher(
        user_id=user.id,
        first_name="Eski",
        last_name="Familiya",
        third_name="Otasining",
        full_name="Eski Familiya Otasining",
        hemis_id=None,
        external_id=EXTERNAL_ID,
        external_source=SOURCE_EDUPLAN,
    )
    async_db.add(teacher)
    await async_db.commit()
    return teacher.id


@pytest.mark.asyncio
async def test_resync_updates_linked_teacher(async_db_engine, linked_teacher):
    session_maker = async_sessionmaker(bind=async_db_engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        # Ровно как в `_apply_one`: голый get, связь `user` не подгружена.
        existing = await session.get(Teacher, linked_teacher)
        assert "user" not in existing.__dict__, "тест обязан идти по неподгруженной связи"

        await eduplan_repository.upsert_teacher(
            session,
            external_id=EXTERNAL_ID,
            username="eduplan_linked",
            hemis_id="H-777",
            first_name="Yangi",
            last_name="Familiya",
            third_name="Otasining",
            full_name="Yangi Familiya Otasining",
            kafedra_id=None,
            existing=existing,
        )
        await session.commit()

    async with session_maker() as session:
        stored = await session.get(
            Teacher,
            linked_teacher,
            options=[selectinload(Teacher.user).selectinload(User.roles)],
        )
        assert stored.full_name == "Yangi Familiya Otasining"
        assert stored.first_name == "Yangi"
        assert stored.hemis_id == "H-777"
        # Базовая роль назначается по тому же `user`, ради которого связь и бралась.
        assert [r.name for r in stored.user.roles] == ["teacher"]
