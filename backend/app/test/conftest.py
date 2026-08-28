import pytest_asyncio
import redis.asyncio as redis
from core.config import settings
from core.database.db_helper import db_helper
from fastapi_limiter import FastAPILimiter
from httpx import ASGITransport, AsyncClient
from main import app as fastapi_app
from redis.asyncio import ConnectionPool
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

import app.core.database.models_registry  # noqa: F401
from app.core.database.base import Base


@pytest_asyncio.fixture(scope="function", autouse=True)
async def init_test_services():
    """
    Инициализация всех внешних сервисов (Limiter).
    """
    test_redis = redis.from_url(settings.redis.url, encoding="utf-8", decode_responses=True)

    await FastAPILimiter.init(test_redis)

    yield

    await test_redis.aclose()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def clear_test_redis():
    """
    Очистка Redis перед каждым тестом, чтобы избежать ошибки 429 (Rate Limit).
    """
    test_redis = redis.from_url(settings.redis.url)
    await test_redis.flushdb()  # Полностью очищаем базу перед тестом
    await test_redis.aclose()
    yield


@pytest_asyncio.fixture(scope="function", autouse=True)
async def reset_global_redis_pool():
    """Сбрасывает пул глобального `core.redis_client` после каждого теста.

    Клиент создаётся один раз при импорте модуля, а его пул привязывается к тому
    event loop, который первым им воспользовался. pytest-asyncio даёт каждому тесту
    свой loop, поэтому со второго теста любой вызов Redis из приложения падал с
    «Event loop is closed» — а через Redis идёт запись сессии при логине, так что
    падал сам вход, и все фикстуры, требующие авторизации, отваливались с 401.

    Подменяется именно `connection_pool` на существующем объекте клиента, а не сам
    клиент: `modules.auth.user.service` импортирует `redis_client` по значению, и
    подмена атрибута модуля до него бы не дошла. Продакшн-код не затронут: там loop
    один на весь процесс.
    """
    from core.redis_client import redis_client

    previous_pool = redis_client.connection_pool
    redis_client.connection_pool = ConnectionPool.from_url(
        settings.redis.url,
        encoding="utf8",
        decode_responses=True,
    )
    await previous_pool.disconnect()

    yield

    await redis_client.connection_pool.disconnect()


async_engine = create_async_engine(
    url=str(settings.database.test_url),
    echo=False,
    poolclass=NullPool,
)


@pytest_asyncio.fixture(scope="function")
async def async_db_engine():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield async_engine

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


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
    from app.modules.auth.model import Role

    role = Role(name="Admin")
    async_db.add(role)
    await async_db.commit()
    await async_db.refresh(role)
    return role


@pytest_asyncio.fixture
async def test_user(async_client, test_role):
    payload = {
        "username": "test_user",
        "password": "password123",
        "roles": [{"name": "Admin"}],
    }

    response = await async_client.post("/user/", json=payload)
    assert response.status_code == 201
    data = response.json()
    data["password"] = payload["password"]
    return data


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
    # Префикс `Bearer` обязателен: `auth_service._strip_bearer` отвергает заголовок
    # без него, и ровно так шлёт фронт (`services/api.ts`). Без префикса все
    # авторизованные запросы в тестах отдавали 401.
    async_client.headers.update(
        {
            "Authorization": f"Bearer {access_token}",
        }
    )
    return async_client


@pytest_asyncio.fixture
async def test_subject(async_db):
    """Create a subject directly in DB since there is no API for it"""
    from app.modules.quiz.model import Subject

    subject = Subject(name="Mathematics")
    async_db.add(subject)
    await async_db.commit()
    await async_db.refresh(subject)
    return subject


@pytest_asyncio.fixture
async def make_questions(auth_client):
    """Наполняет банк вопросов преподавателя по предмету и возвращает их id.

    Активный тест требует, чтобы доступных вопросов было не меньше `question_number`,
    поэтому банк наполняется ДО создания теста — в том же порядке, в котором это
    происходит в работе: лектор грузит вопросы, организатор потом собирает тест.
    """

    async def _make(subject_id: int, user_id: int, count: int = 1, prefix: str = "Q") -> list[int]:
        ids = []
        for i in range(count):
            response = await auth_client.post(
                "/question/",
                json={
                    "subject_id": subject_id,
                    "user_id": user_id,
                    "text": f"{prefix}{i}",
                    "option_a": "A",
                    "option_b": "B",
                    "option_c": "C",
                    "option_d": "D",
                    "correct_option": "a",
                },
            )
            assert response.status_code == 201
            ids.append(response.json()["id"])
        return ids

    return _make


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
    payload = {
        "username": "teacher_fixture_user",
        "password": "password123",
        "first_name": "John",
        "last_name": "Doe",
        "third_name": "Smith",
        "kafedra_id": test_kafedra["id"],
        "roles": [{"name": "Admin"}],
    }
    response = await auth_client.post("/teacher/", json=payload)
    assert response.status_code == 201
    return response.json()
