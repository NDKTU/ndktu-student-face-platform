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


# Qoʻshimcha qatorlarni HTTP orqali emas, repository orqali yaratadigan fabrikalar.
# Fakultet/guruh/mutaxassislik/fan endpointlari 2026-09-11 da kommentga olindi
# (maʼlumot EPOS/HEMIS'dan keladi), lekin testlarga baʼzan ikkinchi guruh yoki
# boshqa fakultet kerak — ular shu fabrikalardan olinadi.
@pytest_asyncio.fixture
async def make_faculty(async_db):
    from app.modules.organization_structure.faculty.repository import get_faculty_repository
    from app.modules.organization_structure.faculty.schemas import FacultyCreateRequest, FacultyCreateResponse

    async def _make(name: str) -> dict:
        faculty = await get_faculty_repository.create_faculty(session=async_db, data=FacultyCreateRequest(name=name))
        return FacultyCreateResponse.model_validate(faculty).model_dump(mode="json")

    return _make


@pytest_asyncio.fixture
async def make_kafedra(async_db):
    from app.modules.organization_structure.kafedra.repository import get_kafedra_repository
    from app.modules.organization_structure.kafedra.schemas import KafedraCreateRequest, KafedraCreateResponse

    async def _make(name: str, faculty_id: int) -> dict:
        kafedra = await get_kafedra_repository.create_kafedra(
            session=async_db, data=KafedraCreateRequest(name=name, faculty_id=faculty_id)
        )
        return KafedraCreateResponse.model_validate(kafedra).model_dump(mode="json")

    return _make


@pytest_asyncio.fixture
async def make_group(async_db):
    from app.modules.organization_structure.group.repository import get_group_repository
    from app.modules.organization_structure.group.schemas import GroupCreateRequest, GroupCreateResponse

    async def _make(name: str, faculty_id: int) -> dict:
        group = await get_group_repository.create_group(
            session=async_db, data=GroupCreateRequest(name=name, faculty_id=faculty_id)
        )
        return GroupCreateResponse.model_validate(group).model_dump(mode="json")

    return _make


@pytest_asyncio.fixture
async def make_speciality(async_db):
    from app.modules.organization_structure.speciality.repository import get_speciality_repository
    from app.modules.organization_structure.speciality.schemas import SpecialityCreateRequest, SpecialityResponse

    async def _make(name: str, kafedra_id: int, education_type: str | None = None) -> dict:
        speciality = await get_speciality_repository.create_speciality(
            session=async_db,
            data=SpecialityCreateRequest(name=name, kafedra_id=kafedra_id, education_type=education_type),
        )
        return SpecialityResponse.model_validate(speciality).model_dump(mode="json")

    return _make


@pytest_asyncio.fixture
async def make_teacher(async_db):
    from app.modules.auth.teacher.repository import get_teacher_repository
    from app.modules.auth.teacher.schemas import TeacherCreateRequest, TeacherCreateResponse

    async def _make(username: str, kafedra_id: int | None = None, roles: list[dict] | None = None) -> dict:
        teacher = await get_teacher_repository.create_teacher(
            session=async_db,
            data=TeacherCreateRequest(
                username=username,
                password="password123",
                first_name=username,
                last_name="T",
                third_name="T",
                kafedra_id=kafedra_id,
                roles=roles or [],
            ),
        )
        return TeacherCreateResponse.model_validate(teacher).model_dump(mode="json")

    return _make


@pytest_asyncio.fixture
async def make_subject(async_db):
    from app.modules.quiz.model import Subject

    async def _make(name: str) -> Subject:
        subject = Subject(name=name)
        async_db.add(subject)
        await async_db.commit()
        await async_db.refresh(subject)
        return subject

    return _make


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


# Fakultet/kafedra/guruh/oʻqituvchi endpointlari kommentga olindi (2026-09-11):
# bu maʼlumot EPOS/HEMIS sinxronizatsiyasidan keladi. Fixture'lar endi HTTP orqali
# emas, sinx qanday yozsa — shunday, to'g'ridan-to'g'ri repository orqali yozadi.
# Javob shakli o'zgarmadi: testlar avvalgidek dict kalitlarini o'qiydi.
@pytest_asyncio.fixture
async def test_faculty(auth_client, async_db):
    from app.modules.organization_structure.faculty.repository import get_faculty_repository
    from app.modules.organization_structure.faculty.schemas import FacultyCreateRequest, FacultyCreateResponse

    faculty = await get_faculty_repository.create_faculty(
        session=async_db, data=FacultyCreateRequest(name="IT Faculty")
    )
    return FacultyCreateResponse.model_validate(faculty).model_dump(mode="json")


@pytest_asyncio.fixture
async def test_kafedra(auth_client, async_db, test_faculty):
    from app.modules.organization_structure.kafedra.repository import get_kafedra_repository
    from app.modules.organization_structure.kafedra.schemas import KafedraCreateRequest, KafedraCreateResponse

    kafedra = await get_kafedra_repository.create_kafedra(
        session=async_db,
        data=KafedraCreateRequest(name="Software Engineering", faculty_id=test_faculty["id"]),
    )
    return KafedraCreateResponse.model_validate(kafedra).model_dump(mode="json")


@pytest_asyncio.fixture
async def test_group(auth_client, async_db, test_faculty):
    from app.modules.organization_structure.group.repository import get_group_repository
    from app.modules.organization_structure.group.schemas import GroupCreateRequest, GroupCreateResponse

    group = await get_group_repository.create_group(
        session=async_db,
        data=GroupCreateRequest(name="SE-2023", faculty_id=test_faculty["id"]),
    )
    return GroupCreateResponse.model_validate(group).model_dump(mode="json")


@pytest_asyncio.fixture
async def test_teacher(auth_client, async_db, test_kafedra):
    from app.modules.auth.teacher.repository import get_teacher_repository
    from app.modules.auth.teacher.schemas import TeacherCreateRequest, TeacherCreateResponse

    teacher = await get_teacher_repository.create_teacher(
        session=async_db,
        data=TeacherCreateRequest(
            username="teacher_fixture_user",
            password="password123",
            first_name="John",
            last_name="Doe",
            third_name="Smith",
            kafedra_id=test_kafedra["id"],
            roles=[{"name": "Admin"}],
        ),
    )
    return TeacherCreateResponse.model_validate(teacher).model_dump(mode="json")
