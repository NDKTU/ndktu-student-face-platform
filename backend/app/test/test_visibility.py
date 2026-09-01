"""Admin spravochnik yozuvini yashirsa, boshqa rollar uni koʻrmasligi.

Yashirish `is_active` dan alohida bayroq (`is_hidden`) bilan ishlaydi:
`is_active` — EduPlan sinxronizatsiyasiniki va «manbada hali bormi» degan
maʼnoni bildiradi, `is_hidden` esa adminning qarori. Ikkovini bitta ustunga
yigʻsak, sinxronizatsiya admin yashirgan satrni qaytadan yoqib yuborardi.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest_asyncio.fixture
async def hidden_setup(async_db, auth_client):
    """Ikkita fakultet: biri yashiriladi, ikkinchisi nazorat uchun qoladi."""
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole
    from app.modules.organization_structure.model import Faculty

    visible = Faculty(name="Koʻrinadigan fakultet")
    hidden = Faculty(name="Yashiriladigan fakultet")
    async_db.add_all([visible, hidden])
    await async_db.flush()

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()

    for name in ("read:faculty", "update:faculty"):
        permission = Permission(name=name)
        async_db.add(permission)
        await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(
        username="visibility_probe",
        password=hash_password("password123"),
        is_active=True,
    )
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))

    await async_db.commit()
    return {"visible_id": visible.id, "hidden_id": hidden.id}


@pytest_asyncio.fixture
async def probe_client(async_client: AsyncClient, hidden_setup):
    """Admin boʻlmagan foydalanuvchi."""
    response = await async_client.post(
        "/user/login", json={"username": "visibility_probe", "password": "password123"}
    )
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


async def _hide(client: AsyncClient, faculty_id: int, value: bool = True):
    return await client.patch(f"/faculty/{faculty_id}/visibility", json={"is_hidden": value})


@pytest.mark.asyncio
async def test_hidden_row_disappears_from_the_list(auth_client, hidden_setup):
    response = await _hide(auth_client, hidden_setup["hidden_id"])
    assert response.status_code == 200
    assert response.json()["is_hidden"] is True

    listing = await auth_client.get("/faculty/", params={"limit": 100})
    ids = [item["id"] for item in listing.json()["faculties"]]
    assert hidden_setup["hidden_id"] not in ids
    assert hidden_setup["visible_id"] in ids


@pytest.mark.asyncio
async def test_admin_can_find_hidden_rows_again(auth_client, hidden_setup):
    """Usiz admin yashirganini qaytara olmaydi — qopqonning oʻzi."""
    await _hide(auth_client, hidden_setup["hidden_id"])

    listing = await auth_client.get("/faculty/", params={"limit": 100, "include_hidden": True})
    ids = [item["id"] for item in listing.json()["faculties"]]
    assert hidden_setup["hidden_id"] in ids


@pytest.mark.asyncio
async def test_hiding_is_reversible(auth_client, hidden_setup):
    await _hide(auth_client, hidden_setup["hidden_id"])
    restored = await _hide(auth_client, hidden_setup["hidden_id"], value=False)
    assert restored.json()["is_hidden"] is False

    listing = await auth_client.get("/faculty/", params={"limit": 100})
    assert hidden_setup["hidden_id"] in [item["id"] for item in listing.json()["faculties"]]


@pytest.mark.asyncio
async def test_non_admin_cannot_hide(probe_client, hidden_setup):
    """`update:faculty` ruxsati boʻlsa ham — yashirish faqat adminda."""
    response = await _hide(probe_client, hidden_setup["hidden_id"])
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_bypass_the_filter(async_db, probe_client, hidden_setup):
    """include_hidden'ni admin boʻlmagan odam yuborsa, u eʼtiborga olinmaydi.

    Bayroq bevosita bazada qoʻyiladi: endpoint boshqa testlarda qoplangan,
    bu yerda faqat filtrni chetlab oʻtib boʻlmasligi tekshirilyapti.
    """
    from sqlalchemy import update

    from app.modules.organization_structure.model import Faculty

    await async_db.execute(
        update(Faculty).where(Faculty.id == hidden_setup["hidden_id"]).values(is_hidden=True)
    )
    await async_db.commit()

    listing = await probe_client.get("/faculty/", params={"limit": 100, "include_hidden": True})
    ids = [item["id"] for item in listing.json()["faculties"]]
    assert hidden_setup["hidden_id"] not in ids
    assert hidden_setup["visible_id"] in ids
