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


@pytest.mark.asyncio
async def test_me_has_no_authorization_parameter():
    """Заголовок читает security-схема. Отдельный `Header(...)` рисовал в Swagger
    второе обязательное поле и заставлял валидировать сессию дважды."""
    from main import app as fastapi_app

    params = fastapi_app.openapi()["paths"]["/api/user/me"]["get"].get("parameters", [])

    assert [p for p in params if p["name"].lower() == "authorization"] == []


@pytest.mark.asyncio
async def test_me_returns_roles(auth_client):
    response = await auth_client.get("/user/me")

    assert response.status_code == 200
    assert [r["name"] for r in response.json()["roles"]] == ["Admin"]


@pytest.mark.asyncio
async def test_me_rejects_a_token_without_the_bearer_scheme(async_client, access_token):
    async_client.headers.update({"Authorization": access_token})

    response = await async_client.get("/user/me")

    assert response.status_code == 401


# Ниже `auth_client` и `async_client` — один и тот же объект, у второго просто нет
# заголовка. Подмена `Authorization` видна в обоих, поэтому она всегда делается
# после того, как админский запрос уже выполнен.


@pytest.mark.asyncio
async def test_update_user_rejects_a_taken_username(auth_client, test_user):
    """`users.username` уникален: без явной проверки был бы IntegrityError и 500."""
    other = await auth_client.post(
        "/user/",
        json={"username": "second_user", "password": "password123", "roles": [{"name": "Admin"}]},
    )
    assert other.status_code == 201

    response = await auth_client.put(
        f"/user/{other.json()['id']}", json={"username": test_user["username"]}
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_user_no_longer_accepts_a_password(auth_client, test_user):
    response = await auth_client.put(
        f"/user/{test_user['id']}", json={"username": "kept_user", "password": "hacked"}
    )

    assert response.status_code == 200
    # Пароль не изменился — вход по старому по-прежнему работает.
    login = await auth_client.post(
        "/user/login", json={"username": "kept_user", "password": test_user["password"]}
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_revokes_the_target_session(auth_client, async_client, test_user):
    """Сброс пароля обязан выбросить владельца старого токена: иначе смена
    пароля скомпрометированной учётки ничего не даёт до истечения idle-TTL."""
    target = await auth_client.post(
        "/user/",
        json={"username": "victim", "password": "password123", "roles": [{"name": "Admin"}]},
    )
    target_id = target.json()["id"]

    login = await async_client.post(
        "/user/login", json={"username": "victim", "password": "password123"}
    )
    victim_token = login.json()["access_token"]

    response = await auth_client.post(
        f"/user/{target_id}/reset-password", json={"new_password": "brand_new_pw"}
    )
    assert response.status_code == 204

    async_client.headers.update({"Authorization": f"Bearer {victim_token}"})
    assert (await async_client.get("/user/me")).status_code == 401

    relogin = await async_client.post(
        "/user/login", json={"username": "victim", "password": "brand_new_pw"}
    )
    assert relogin.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_refuses_your_own_account(auth_client, test_user):
    """Своя смена пароля идёт через /user/me/credentials и требует текущий
    пароль. Через админский сброс эту проверку обходить нельзя."""
    response = await auth_client.post(
        f"/user/{test_user['id']}/reset-password", json={"new_password": "self_service"}
    )

    assert response.status_code == 400
