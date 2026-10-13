"""Talaba bejigi: maʼlumot va surat faqat adminga beriladi.

Tugmani frontendda yashirish himoya emas — endpointning oʻzi rolni
tekshiradi. `read:student` ruxsati bor oʻqituvchi talabani koʻra oladi, lekin
bejigini ololmaydi; oʻqituvchi koʻrinishiga oʻtgan admin ham.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.modules.auth.student import badge as badge_module
from app.test.test_student_teacher_scope import _student

JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PHOTO_URL = "https://hemis.example.uz/static/crop/1/2/photo.jpg"


@pytest_asyncio.fixture
async def badge_student(async_db, test_faculty, make_group):
    group = await make_group("7A-25 KM", test_faculty["id"])
    student = _student(None, group["id"], "310211100123", "Anvar")
    student.faculty = "  Kimyo-metallurgiya "
    student.image_path = PHOTO_URL
    async_db.add(student)
    await async_db.commit()
    await async_db.refresh(student)
    return student


@pytest_asyncio.fixture
async def reader_headers(async_client: AsyncClient, async_db, badge_student):
    """`read:student` ruxsati bor, lekin admin boʻlmagan foydalanuvchi."""
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    role = Role(name="tutor")
    permission = Permission(name="read:student")
    async_db.add_all([role, permission])
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(username="badge_reader", password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.commit()

    response = await async_client.post("/user/login", json={"username": "badge_reader", "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def photo_download(monkeypatch):
    """HEMIS'ga chiqmaslik uchun yuklab olish almashtiriladi."""
    calls: list[str] = []

    def _install(result):
        async def _fake(url: str) -> bytes:
            calls.append(url)
            if isinstance(result, Exception):
                raise result
            return result

        monkeypatch.setattr(badge_module, "_download", _fake)
        return calls

    return _install


@pytest.mark.asyncio
async def test_admin_gets_badge_data(auth_client: AsyncClient, badge_student):
    response = await auth_client.get(f"/students/{badge_student.id}/badge")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "student_id": badge_student.id,
        "full_name": "Anvar Talaba T",
        # Boʻsh joylar kesiladi: HEMIS'dan «Kimyo-metallurgiya » kabi keladi.
        "faculty": "Kimyo-metallurgiya",
        "group_name": "7A-25 KM",
        "student_id_number": "310211100123",
        "has_photo": True,
    }


@pytest.mark.asyncio
async def test_badge_faculty_falls_back_to_group_faculty(
    auth_client: AsyncClient, async_db, test_faculty, badge_student
):
    badge_student.faculty = ""
    badge_student.image_path = ""
    await async_db.commit()

    response = await auth_client.get(f"/students/{badge_student.id}/badge")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["faculty"] == test_faculty["name"]
    assert data["has_photo"] is False


@pytest.mark.asyncio
async def test_badge_of_unknown_student_is_404(auth_client: AsyncClient):
    assert (await auth_client.get("/students/99999/badge")).status_code == 404
    assert (await auth_client.get("/students/99999/badge/photo")).status_code == 404


@pytest.mark.asyncio
async def test_admin_gets_badge_photo(auth_client: AsyncClient, badge_student, photo_download):
    calls = photo_download(JPEG_BYTES)

    response = await auth_client.get(f"/students/{badge_student.id}/badge/photo")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content == JPEG_BYTES
    assert calls == [PHOTO_URL]


@pytest.mark.asyncio
async def test_badge_photo_missing_is_404(auth_client: AsyncClient, async_db, badge_student, photo_download):
    calls = photo_download(JPEG_BYTES)
    badge_student.image_path = "  "
    await async_db.commit()

    response = await auth_client.get(f"/students/{badge_student.id}/badge/photo")
    assert response.status_code == 404
    assert calls == []


@pytest.mark.asyncio
async def test_badge_photo_download_failure_is_502(auth_client: AsyncClient, badge_student, photo_download):
    photo_download(badge_module._PhotoUnavailable("timeout"))

    response = await auth_client.get(f"/students/{badge_student.id}/badge/photo")
    assert response.status_code == 502


@pytest.mark.asyncio
async def test_badge_photo_that_is_not_an_image_is_502(auth_client: AsyncClient, badge_student, photo_download):
    """Manzil HTML xato sahifasiga koʻrsatsa, u rasm deb uzatilmaydi."""
    photo_download(b"<html><body>404</body></html>")

    response = await auth_client.get(f"/students/{badge_student.id}/badge/photo")
    assert response.status_code == 502


@pytest.mark.asyncio
async def test_badge_photo_path_other_than_http_or_uploads_is_502(
    auth_client: AsyncClient, async_db, badge_student, photo_download
):
    calls = photo_download(JPEG_BYTES)
    badge_student.image_path = "file:///etc/passwd"
    await async_db.commit()

    response = await auth_client.get(f"/students/{badge_student.id}/badge/photo")
    assert response.status_code == 502
    assert calls == []


@pytest.mark.asyncio
async def test_badge_local_photo_cannot_escape_uploads(auth_client: AsyncClient, async_db, badge_student):
    badge_student.image_path = "/uploads/../../../../etc/passwd"
    await async_db.commit()

    response = await auth_client.get(f"/students/{badge_student.id}/badge/photo")
    assert response.status_code == 502


@pytest.mark.asyncio
async def test_badge_requires_authentication(async_client: AsyncClient, badge_student):
    # `badge_student` fakultet fixturasi orqali shu mijozni admin sifatida
    # kiritib qoʻygan — sarlavha olib tashlanadi.
    async_client.headers.pop("Authorization", None)

    assert (await async_client.get(f"/students/{badge_student.id}/badge")).status_code == 401
    assert (await async_client.get(f"/students/{badge_student.id}/badge/photo")).status_code == 401


@pytest.mark.asyncio
async def test_non_admin_with_read_student_is_denied(
    async_client: AsyncClient, badge_student, reader_headers, photo_download
):
    calls = photo_download(JPEG_BYTES)

    # Talabaning oʻzini koʻra oladi — ruxsat bor.
    profile = await async_client.get(f"/students/{badge_student.id}", headers=reader_headers)
    assert profile.status_code == 200, profile.text

    badge = await async_client.get(f"/students/{badge_student.id}/badge", headers=reader_headers)
    photo = await async_client.get(f"/students/{badge_student.id}/badge/photo", headers=reader_headers)
    assert badge.status_code == 403
    assert photo.status_code == 403
    assert calls == []


@pytest.mark.asyncio
async def test_admin_in_another_role_view_is_denied(auth_client: AsyncClient, async_db, test_user, badge_student):
    """`X-Active-Role` bilan oʻqituvchi koʻrinishiga oʻtgan admin — admin emas."""
    from app.modules.auth.model import Role, UserRole

    role = Role(name="teacher")
    async_db.add(role)
    await async_db.flush()
    async_db.add(UserRole(user_id=test_user["id"], role_id=role.id))
    await async_db.commit()

    as_teacher = await auth_client.get(
        f"/students/{badge_student.id}/badge", headers={"X-Active-Role": str(role.id)}
    )
    assert as_teacher.status_code == 403

    as_admin = await auth_client.get(f"/students/{badge_student.id}/badge")
    assert as_admin.status_code == 200
