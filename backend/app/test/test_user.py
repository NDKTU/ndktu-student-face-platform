import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


@pytest.mark.asyncio
async def test_create_user(auth_client):
    payload = {"name": "user"}
    response = await auth_client.post("/role/", json=payload)
    assert response.status_code == 201
    user_payload = {
        "username": "bezod",
        "password": "password123",
        "roles": [{"name": "user"}],
    }
    response = await auth_client.post("/user/", json=user_payload)
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_get_all_users(auth_client):
    response = await auth_client.get("/user/", params={"page": 1, "limit": 10, "username": "admin"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_user_id(auth_client):
    response = await auth_client.get("/user/1")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_user_not_foud(auth_client):
    response = await auth_client.get("/user/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


@pytest.mark.asyncio
async def test_update_user(auth_client):
    response = await auth_client.put("/user/1", json={"username": "admineer"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_user_user_not_found(auth_client):
    response = await auth_client.put("/user/999", json={"username": "admineer"})
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


@pytest.mark.asyncio
async def test_delete_user(auth_client):
    response = await auth_client.delete("/user/1")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_user_not_found(auth_client):
    response = await auth_client.delete("/user/1999")
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


@pytest.mark.asyncio
async def test_update_user_returns_roles(async_db_engine, test_user):
    """`UserCreateResponse.roles` обязателен, и его сериализация не должна
    триггерить ленивый IO вне greenlet-контекста.

    Тест намеренно идёт мимо `auth_client`. Conftest подсовывает роуту ту же
    сессию, которой пользовались фикстуры, поэтому пользователь приходил бы из
    identity map с уже загруженными ролями и проверка зеленела бы, ничего не
    проверив (проверено: и `expire_all`, и `expunge_all` этого не меняют). В
    проде сессия у каждого запроса своя — здесь она такая же, отдельная.
    """
    from app.modules.auth.user.repository import get_user_repository
    from app.modules.auth.user.schemas import UserCreateResponse, UserUpdateRequest

    factory = async_sessionmaker(bind=async_db_engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        user = await get_user_repository.update_user(
            session=session,
            user_id=test_user["id"],
            data=UserUpdateRequest(username="renamed_user"),
        )
        dumped = UserCreateResponse.model_validate(user)

    assert dumped.username == "renamed_user"
    assert [r.name for r in dumped.roles] == ["Admin"]
