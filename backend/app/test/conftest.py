import os

import pytest_asyncio
import redis.asyncio as redis
from core.config import settings
from core.database.db_helper import db_helper
from fastapi_limiter import FastAPILimiter
from httpx import ASGITransport, AsyncClient
from main import app as fastapi_app
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

import app.core.database.models_registry  # noqa: F401
from app.core.database.base import Base

# Тесты ходят в Redis снаружи контейнера, поэтому адрес хостовой, а не `redis`.
# Порт вынесен в docker-compose на 6380: 6379 на машине разработчика может быть
# занят чужим Redis, и тогда наш контейнер вообще не поднимется.
TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6380")


@pytest_asyncio.fixture(scope="function", autouse=True)
async def init_test_services():
    """
    Инициализация всех внешних сервисов (Limiter).
    """
    test_redis = redis.from_url(TEST_REDIS_URL, encoding="utf-8", decode_responses=True)

    await FastAPILimiter.init(test_redis)

    yield

    await test_redis.aclose()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def clear_test_redis():
    """
    Очистка Redis перед каждым тестом, чтобы избежать ошибки 429 (Rate Limit).
    """
    test_redis = redis.from_url(TEST_REDIS_URL)
    await test_redis.flushdb()  # Полностью очищаем базу перед тестом
    await test_redis.aclose()

    yield

    # Приложение держит Redis-клиент модульным синглтоном, а pytest-asyncio даёт
    # каждому тесту свой event loop. Без сброса пула следующий тест получает
    # соединение, привязанное к уже закрытому циклу, и падает с
    # «Event loop is closed» ещё на логине.
    from core.redis_client import redis_client as app_redis

    await app_redis.aclose()


async_engine = create_async_engine(
    url=str(settings.database.test_url),
    echo=False,
    poolclass=NullPool,
)


async def _reset_schema(conn) -> None:
    """Сносит схему целиком вместо `Base.metadata.drop_all`.

    `students.group_id` и `groups.sardor_student_id` (староста группы) ссылаются
    друг на друга, и топологическая сортировка в `drop_all` падает с
    CircularDependencyError. Из-за этого teardown не отрабатывал вовсе: таблицы и
    данные переживали прогон, и следующий запуск умирал на UniqueViolation ещё
    в фикстурах. `DROP SCHEMA ... CASCADE` сортировки не требует и заодно
    подчищает то, что оставил предыдущий упавший прогон.
    """
    await conn.execute(text("DROP SCHEMA public CASCADE"))
    await conn.execute(text("CREATE SCHEMA public"))


@pytest_asyncio.fixture(scope="function")
async def async_db_engine():
    async with async_engine.begin() as conn:
        # Сброс и на входе тоже: прогон не должен зависеть от того, чем
        # закончился предыдущий.
        await _reset_schema(conn)
        await conn.run_sync(Base.metadata.create_all)

    yield async_engine

    async with async_engine.begin() as conn:
        await _reset_schema(conn)


@pytest_asyncio.fixture(scope="function")
async def async_db(async_db_engine):
    async_session = async_sessionmaker(
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
        bind=async_db_engine,
        class_=AsyncSession,
    )

    async with async_session() as session:
        await session.begin()

        yield session

        await session.rollback()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def async_client(async_db):
    def override_get_db():
        yield async_db

    fastapi_app.dependency_overrides[db_helper.session_getter] = override_get_db
    return AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://localhost/api")


@pytest_asyncio.fixture
async def test_role(async_db):
    from app.modules.auth.role.model import Role

    role = Role(name="Admin")
    async_db.add(role)
    await async_db.commit()
    await async_db.refresh(role)
    return role


@pytest_asyncio.fixture
async def test_user(async_db, test_role):
    """Первую учётку заводим прямо в БД, а не через `POST /user/`.

    У того роута стоит `PermissionRequired("create:user")`, а до появления
    первого пользователя предъявить это право некому — фикстура получала 401.
    В приложении ту же задачу решает `ensure_admin_user` на старте, тоже в обход
    API.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.user.model import User

    password = "password123"
    user = User(username="test_user", password=hash_password(password), roles=[test_role])
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user, attribute_names=["roles"])

    return {"id": user.id, "username": user.username, "password": password}


@pytest_asyncio.fixture
async def access_token(async_client, test_user):
    response = await async_client.post(
        "/user/login",
        json={
            "username": test_user["username"],
            "password": test_user["password"],
        },
    )

    assert response.status_code == 200
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def auth_client(async_client, access_token):
    # Заголовок собирается ровно так же, как его шлёт фронт (`shared/api/http.ts`),
    # и так, как его требует `_strip_bearer`: без схемы токен не принимается.
    async_client.headers.update({"Authorization": f"Bearer {access_token}"})
    return async_client


@pytest_asyncio.fixture
async def create_permission(async_client, access_token):
    payload = {"name": "read:book"}

    response = await async_client.post("/permission/", json=payload)

    assert response.status_code == 201


@pytest_asyncio.fixture
async def test_subject(async_db):
    """Create a subject directly in DB since there is no API for it"""
    from app.modules.quiz.subject.model import Subject

    subject = Subject(name="Mathematics")
    async_db.add(subject)
    await async_db.commit()
    await async_db.refresh(subject)
    return subject


@pytest_asyncio.fixture
async def test_faculty(auth_client):
    payload = {"name": "IT Faculty"}
    response = await auth_client.post("/faculty/", json=payload)
    assert response.status_code == 201
    return response.json()


@pytest_asyncio.fixture
async def test_kafedra(auth_client, test_faculty):
    payload = {"name": "Software Engineering", "faculty_id": test_faculty["id"]}
    response = await auth_client.post("/kafedra/", json=payload)
    assert response.status_code == 201
    return response.json()


@pytest_asyncio.fixture
async def test_group(auth_client, test_faculty):
    payload = {"name": "SE-2023", "faculty_id": test_faculty["id"]}
    response = await auth_client.post("/group/", json=payload)
    assert response.status_code == 201
    return response.json()


@pytest_asyncio.fixture
async def test_teacher(auth_client, test_kafedra):
    employee_payload = {
        "username": "teacher_fixture_user",
        "password": "password123",
        "first_name": "John",
        "last_name": "Doe",
        "third_name": "Smith",
        "roles": [{"name": "Admin"}],
    }
    employee_response = await auth_client.post("/employee/", json=employee_payload)
    assert employee_response.status_code == 201
    employee_data = employee_response.json()

    payload = {
        "kafedra_id": test_kafedra["id"],
        "employee_id": employee_data["id"],
    }
    response = await auth_client.post("/teacher/", json=payload)
    assert response.status_code == 201
    return response.json()
