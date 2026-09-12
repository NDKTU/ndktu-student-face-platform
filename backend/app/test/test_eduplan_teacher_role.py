import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Role, Teacher, User, UserRole
from app.modules.integration.eduplan.repository import eduplan_repository


@pytest.mark.asyncio
async def test_upsert_teacher_creates_missing_role(async_db):
    """На свежей базе роли `teacher` ещё нет — синхронизация обязана её завести.

    Раньше `_ensure_role` в этом случае только писала предупреждение в лог, и
    приехавший синхронизацией преподаватель оставался вообще без ролей: в
    списке пользователей «Rol biriktirilmagan», а сам он после входа упирался
    в 403 на каждом экране.
    """
    assert (await async_db.execute(select(Role).where(Role.name == "teacher"))).scalar_one_or_none() is None

    teacher = await eduplan_repository.upsert_teacher(
        async_db,
        external_id="777",
        username="3192211075",
        hemis_id="3192211075",
        first_name="Ali",
        last_name="Valiyev",
        third_name="",
        full_name="Valiyev Ali",
        kafedra_id=None,
        existing=None,
    )
    await async_db.flush()

    user = (
        await async_db.execute(
            select(User).where(User.id == teacher.user_id).options(selectinload(User.roles))
        )
    ).scalar_one()
    assert [r.name for r in user.roles] == ["teacher"]


@pytest.mark.asyncio
async def test_ensure_teacher_role_backfills_and_is_idempotent(async_db):
    """Преподавателю из прошлых прогонов роль доводится, дубля не возникает.

    Предложение по такому человеку приходит `unchanged`, `upsert_teacher` до
    него не доходит — роль ему выдаёт только массовый проход в конце apply.
    """
    user = User(username="old_teacher", password="hashed")
    async_db.add(user)
    await async_db.flush()
    async_db.add(Teacher(user_id=user.id, first_name="Bek", last_name="Bekov", third_name="", full_name="Bekov Bek"))
    await async_db.flush()

    assert await eduplan_repository.ensure_teacher_role(async_db) == 1
    # Второй прогон ничего не пишет: на `user_roles` нет уникального индекса,
    # так что защита от повтора — только сам подзапрос.
    assert await eduplan_repository.ensure_teacher_role(async_db) == 0

    role = (await async_db.execute(select(Role).where(Role.name == "teacher"))).scalar_one()
    links = (
        await async_db.execute(
            select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
        )
    ).scalars().all()
    assert len(links) == 1
