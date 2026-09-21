"""Tashkiliy tuzilma maʼlumotnomasi oʻqituvchiga yopiq.

Fakultet, kafedra, mutaxassislik va oʻquv reja — maʼmuriyat maʼlumoti:
ularni EPOS/HEMIS toʻldiradi, platformada faqat oʻqiladi. Oʻqituvchining
kundalik ishida butun universitetning boʻlinmalari kerak emas.

Ruxsatni roldan olib tashlash (`b9d6f2a41c73` migratsiyasi) yagona chegara
emas: `read:faculty` va qoʻshnilari qoʻlda qaytarilishi mumkin, seed esa
ruxsat OLIB TASHLAMAYDI (`core/lifespan/defaults.py`). Shuning uchun bu
yerda aynan eng yomon holat tekshiriladi — ruxsat BOR oʻqituvchi.

Psixolog bundan tashqarida: natijalar fakultet kesimida oʻqiladi.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

ORG_STRUCTURE_PERMISSIONS = (
    "read:faculty",
    "read:kafedra",
    "read:speciality",
    "read:curriculum",
)

ORG_STRUCTURE_PATHS = (
    "/faculty/",
    "/faculty/stats",
    "/kafedra/",
    "/kafedra/stats",
    "/speciality/",
    "/speciality/stats",
    "/curriculum/",
)


async def _make_user(async_db, username: str, role_name: str) -> dict:
    """Roli va tashkiliy tuzilma ruxsatlari bor foydalanuvchi.

    Ruxsatlar ataylab beriladi: testning maʼnosi «ruxsati boʻlsa ham
    kirolmaydi» degan vaʼdada, ruxsatsiz holatda esa 403 oddiy
    `PermissionRequired` dan kelardi va tekshiruv «notoʻgʻri sabab bilan»
    oʻtib ketardi.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    role = Role(name=role_name)
    async_db.add(role)
    await async_db.flush()

    for name in ORG_STRUCTURE_PERMISSIONS:
        permission = Permission(name=name)
        async_db.add(permission)
        await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.commit()

    return {"username": username, "password": "password123"}


async def _login(async_client: AsyncClient, credentials: dict) -> AsyncClient:
    response = await async_client.post("/user/login", json=credentials)
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest_asyncio.fixture
async def teacher_client(async_client, async_db):
    return await _login(async_client, await _make_user(async_db, "org_teacher", "Teacher"))


@pytest_asyncio.fixture
async def psychologist_client(async_client, async_db):
    return await _login(async_client, await _make_user(async_db, "org_psixolog", "psixologik"))


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ORG_STRUCTURE_PATHS)
async def test_teacher_cannot_read_organization_structure(teacher_client, path):
    response = await teacher_client.get(path)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_psychologist_still_reads_organization_structure(psychologist_client):
    """Psixologiya natijalari fakultet boʻyicha filtrlanadi — roʻyxat kerak."""
    response = await psychologist_client.get("/faculty/")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_teacher_still_reads_their_groups(teacher_client, async_db):
    """Guruhlar chegaradan tashqarida: oʻqituvchining kundalik ishi shu yerda.

    Guruh ham `organization_structure` moduli ichida, shuning uchun uning
    ochiq qolgani aloxida qotirilgan: `PermissionRequiredExceptTeacher` ni
    butun routerga qoʻyib yuborish oson xato boʻlardi.
    """
    from sqlalchemy import select

    from app.modules.auth.model import Permission, Role, RolePermission

    role = (await async_db.execute(select(Role).where(Role.name == "Teacher"))).scalar_one()
    permission = Permission(name="read:group")
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await async_db.commit()

    response = await teacher_client.get("/group/")
    assert response.status_code == 200
