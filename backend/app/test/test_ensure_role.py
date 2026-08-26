import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Permission, Role, User
from app.modules.auth.user.repository import get_user_repository


@pytest.mark.asyncio
async def test_ensure_role_creates_role_and_grants_user_me_without_lazy_load(async_db):
    """
    Регрессия на MissingGreenlet в ветке создания роли внутри `ensure_role`.

    Первый HEMIS-логин под ролью, которой ещё нет в БД (например "student" на
    свежей базе), уходит в ветку создания роли. Там только что созданная
    `role.permissions` — M2M-коллекция через `role_permissions` с
    `overlaps=...` — при первом обращении после flush уходит в ленивую
    подгрузку, а в async-сессии это падает `greenlet_spawn has not been
    called` (MissingGreenlet). Тест воспроизводит именно этот путь: имя роли
    заведомо отсутствует в базе, так что `ensure_role` обязана взять ветку
    создания.
    """
    permission = Permission(name="user:me")
    async_db.add(permission)

    user = User(username="ensure_role_test_user", password="hashed")
    async_db.add(user)
    await async_db.flush()
    await async_db.refresh(user, attribute_names=["roles"])

    # "newrole" гарантированно отсутствует в свежей тестовой базе — именно
    # эта ветка (создание роли) и падала до фикса.
    await get_user_repository.ensure_role(async_db, user, "newrole")

    role = (
        await async_db.execute(select(Role).where(Role.name == "newrole").options(selectinload(Role.permissions)))
    ).scalar_one()

    assert role in user.roles

    perm_names = {p.name for p in role.permissions}
    assert perm_names == {"user:me"}
