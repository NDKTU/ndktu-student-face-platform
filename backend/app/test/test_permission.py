import pytest
import pytest_asyncio

from app.modules.auth.model import Permission


@pytest_asyncio.fixture
async def seeded_permissions(async_db):
    """Ruxsatlar API orqali emas, ilova ishga tushganda yaratiladi.

    Shuning uchun testda ular to'g'ridan-to'g'ri bazaga yoziladi — API'da
    yaratish/tahrirlash/o'chirish endpoint'lari yo'q.
    """
    perms = [Permission(name="read:book"), Permission(name="update:book")]
    async_db.add_all(perms)
    await async_db.commit()
    for perm in perms:
        await async_db.refresh(perm)
    return perms


@pytest.mark.asyncio
async def test_list_permissions(auth_client, seeded_permissions):
    response = await auth_client.get("/permission/")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {perm["name"] for perm in body["permissions"]} == {"read:book", "update:book"}


@pytest.mark.asyncio
async def test_get_permission(auth_client, seeded_permissions):
    permission = seeded_permissions[0]

    response = await auth_client.get(f"/permission/{permission.id}")

    assert response.status_code == 200
    assert response.json()["name"] == "read:book"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method, path",
    [
        ("post", "/permission/"),
        ("put", "/permission/1"),
        ("delete", "/permission/1"),
    ],
)
async def test_permissions_are_read_only(auth_client, seeded_permissions, method, path):
    response = await auth_client.request(method.upper(), path, json={"name": "read:book"})

    assert response.status_code == 405
