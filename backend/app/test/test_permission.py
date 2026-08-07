import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.auth.permission.model import Permission


@pytest_asyncio.fixture
async def seeded_permission(async_db):
    """Права заводит не API, а старт приложения. В тестах — напрямую в БД,
    тем же приёмом, что и в `test_role_assign_permission.py`."""
    perm = (
        await async_db.execute(select(Permission).where(Permission.name == "read:book"))
    ).scalar_one_or_none()
    if not perm:
        perm = Permission(name="read:book")
        async_db.add(perm)
        await async_db.commit()
        await async_db.refresh(perm)
    return perm


@pytest.mark.asyncio
async def test_list_permissions(auth_client, seeded_permission):
    response = await auth_client.get("/permission/", params={"page": 1, "limit": 10})

    assert response.status_code == 200
    assert seeded_permission.name in [p["name"] for p in response.json()["permissions"]]


@pytest.mark.asyncio
async def test_get_permission_by_id(auth_client, seeded_permission):
    response = await auth_client.get(f"/permission/{seeded_permission.id}")

    assert response.status_code == 200
    assert response.json()["name"] == "read:book"


@pytest.mark.asyncio
async def test_permission_write_endpoints_are_gone(auth_client, seeded_permission):
    """Права выводятся из кода. Ручное создание давало мёртвую строку,
    переименование и удаление молча снимали право со всех ролей."""
    assert (await auth_client.post("/permission/", json={"name": "read:anything"})).status_code == 405
    assert (
        await auth_client.put(f"/permission/{seeded_permission.id}", json={"name": "x"})
    ).status_code == 405
    assert (await auth_client.delete(f"/permission/{seeded_permission.id}")).status_code == 405
