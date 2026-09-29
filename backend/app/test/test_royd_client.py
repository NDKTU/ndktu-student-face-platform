"""ROYD mijozi va routeri: token keshi, so'rov shakli va huquqlar.

Bu yerda ROYD'ning o'zi chaqirilmaydi — `royd_client.request` ushlab
qolinadi va biz **nima yuborayotganimizni** tekshiramiz. Aynan shu joyda
xato qilish oson: hujjatdagi shakl (`docs/INTEGRATION.md` §6) bizning
ichki shaklimizdan farq qiladi — `limit/offset`, fayl maydoni `upload`,
`Idempotency-Key` majburiy.
"""

from datetime import date

import pytest
import pytest_asyncio

from app.core.config import settings
from app.modules.integration.royd.client import RoydClient, royd_client

HEMIS_ID = "3052211100123"


@pytest_asyncio.fixture(autouse=True)
def _enable(monkeypatch):
    monkeypatch.setattr(settings.royd, "base_url", "https://royd.test")
    monkeypatch.setattr(settings.royd, "client_id", "royd_test")
    monkeypatch.setattr(settings.royd, "client_secret", "secret")


@pytest_asyncio.fixture
def captured(monkeypatch):
    """`royd_client.request` chaqiruvlarini yozib boradi."""
    calls: list[dict] = []

    async def _fake(method, path, **kwargs):
        calls.append({"method": method, "path": path, **kwargs})
        return {"ok": True, "id": 1, "tracking_no": "REQ-2026-00001"}

    monkeypatch.setattr(royd_client, "request", _fake)
    return calls


async def _make_student(async_db, username: str, group_id: int, number: str = HEMIS_ID, image: str = ""):
    from app.modules.auth.model import Role, Student, User

    role = Role(name=f"Role-{username}")
    user = User(username=username, password="not-used", roles=[role])
    async_db.add_all([role, user])
    await async_db.flush()
    async_db.add(
        Student(
            user_id=user.id,
            group_id=group_id,
            first_name="Ali",
            last_name="Valiyev",
            third_name="Aliyevich",
            full_name="Valiyev Ali Aliyevich",
            student_id_number=number,
            image_path=image,
            birth_date=date(2004, 1, 1),
            phone="",
            gender="male",
            university="NDKTU",
            specialty="Test",
            student_status="active",
            education_form="full_time",
            education_type="bachelor",
            payment_form="grant",
            education_lang="uz",
            faculty="HEMIS yozgan nom",
            level="1",
            semester="1",
            address="Test",
            avg_gpa=0,
        )
    )
    await async_db.commit()
    return user.id


async def _login(async_client, user_id: int):
    from app.modules.auth.user.service import auth_service

    token = await auth_service.create_session_token(user_id)
    async_client.headers.update({"Authorization": f"Bearer {token}"})
    return async_client


# ───────────────────────────── Token keshi ─────────────────────────────


@pytest.mark.asyncio
async def test_token_is_cached(monkeypatch):
    client = RoydClient()
    calls = {"n": 0}

    async def _fake_fetch():
        calls["n"] += 1
        client._token = "tok"
        client._expires_at = float("inf")
        return "tok"

    monkeypatch.setattr(client, "_fetch_token", _fake_fetch)

    assert await client._access_token() == "tok"
    assert await client._access_token() == "tok"
    # Ikkinchi so'rov uchun token qaytadan olinmasligi kerak: ROYD'da
    # yozish limiti daqiqasiga 30 ta.
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_expired_token_is_refetched(monkeypatch):
    client = RoydClient()
    calls = {"n": 0}

    async def _fake_fetch():
        calls["n"] += 1
        client._token = "tok"
        client._expires_at = 0.0  # darhol eskirgan
        return "tok"

    monkeypatch.setattr(client, "_fetch_token", _fake_fetch)

    await client._access_token()
    await client._access_token()
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_401_refreshes_token_once(monkeypatch):
    """Muddati tugagan tokenda so'rov yo'qolmasligi kerak."""
    client = RoydClient()
    tokens = iter(["old", "new"])
    used: list[str] = []

    async def _fake_fetch():
        value = next(tokens)
        client._token = value
        client._expires_at = float("inf")
        return value

    class FakeResponse:
        def __init__(self, code):
            self.status_code = code
            self.content = b'{"ok": true}'
            self.headers = {}

        def json(self):
            return {"ok": True}

    async def _fake_send(method, path, *, token, **kwargs):
        used.append(token)
        return FakeResponse(401 if len(used) == 1 else 200)

    monkeypatch.setattr(client, "_fetch_token", _fake_fetch)
    monkeypatch.setattr(client, "_send", _fake_send)

    assert await client.request("GET", "/requests") == {"ok": True}
    assert used == ["old", "new"]


@pytest.mark.asyncio
async def test_disabled_integration_returns_503(monkeypatch):
    monkeypatch.setattr(settings.royd, "client_secret", "")
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await RoydClient().request("GET", "/requests")
    assert exc.value.status_code == 503


# ──────────────────────────── So'rov shakli ────────────────────────────


@pytest.mark.asyncio
async def test_create_sends_student_data_and_idempotency_key(
    async_client, async_db, test_faculty, make_group, captured
):
    from sqlalchemy import update

    from app.modules.organization_structure.model import Group

    group = await make_group("IT-21", test_faculty["id"])
    await async_db.execute(update(Group).where(Group.id == group["id"]).values(course=3))
    await async_db.commit()
    user_id = await _make_student(async_db, "royd_create", group["id"])
    client = await _login(async_client, user_id)

    response = await client.post(
        "/integration/royd/requests",
        json={"category_id": 12, "title": "Ma'lumotnoma", "description": "O'qish joyidan"},
    )

    assert response.status_code == 201, response.text
    call = captured[0]
    assert call["path"] == "/requests"
    body = call["json"]
    # Talaba ma'lumotlari serverda yig'iladi, mijozdan olinmaydi.
    assert body["student_hemis_id"] == HEMIS_ID
    assert body["full_name"] == "Valiyev Ali Aliyevich"
    assert body["group"] == "IT-21"
    # Fakultet nomi guruh orqali — `students.faculty` satridan emas: ROYD
    # fakultetni nomi bo'yicha topadi va nom mos kelmasa 409 qaytaradi.
    assert body["faculty"] == test_faculty["name"]
    assert body["faculty"] != "HEMIS yozgan nom"
    # Kalit har doim yuboriladi: tarmoq uzilgach qayta yuborish nusxa
    # yaratmasligi kerak.
    assert call["idempotency_key"]
    # `course` — ROYD 2026-09-29 da majburiy qildi. Bo'sh yuborsak 422.
    assert body["course"] == 3


@pytest.mark.asyncio
async def test_client_idempotency_key_is_passed_through(
    async_client, async_db, test_faculty, make_group, captured
):
    group = await make_group("IT-22", test_faculty["id"])
    user_id = await _make_student(async_db, "royd_idem", group["id"], number="IDEM-1")
    client = await _login(async_client, user_id)

    await client.post(
        "/integration/royd/requests",
        json={"category_id": 12, "title": "Sarlavha", "description": "Matn"},
        headers={"Idempotency-Key": "mening-kalitim"},
    )

    assert captured[0]["idempotency_key"] == "mening-kalitim"


@pytest.mark.asyncio
async def test_relative_image_is_not_sent(
    async_client, async_db, test_faculty, make_group, captured
):
    """Nisbiy havolani ROYD xodimlari ocha olmaydi — yuborilmaydi."""
    group = await make_group("IT-23", test_faculty["id"])
    user_id = await _make_student(
        async_db, "royd_img", group["id"], number="IMG-1", image="/uploads/question/a.png"
    )
    client = await _login(async_client, user_id)

    await client.post(
        "/integration/royd/requests",
        json={"category_id": 1, "title": "Sarlavha", "description": "Matn"},
    )

    assert "image" not in captured[0]["json"]


@pytest.mark.asyncio
async def test_list_uses_limit_offset_and_own_filter(
    async_client, async_db, test_faculty, make_group, captured
):
    group = await make_group("IT-24", test_faculty["id"])
    user_id = await _make_student(async_db, "royd_list", group["id"], number="LIST-1")
    client = await _login(async_client, user_id)

    await client.get("/integration/royd/requests", params={"limit": 5, "offset": 10})

    params = captured[0]["params"]
    # ROYD sahifalashni `limit/offset` bilan qiladi, `page` bilan emas.
    assert params["limit"] == 5
    assert params["offset"] == 10
    # Talaba faqat o'zinikini ko'radi.
    assert params["student_hemis_id"] == "LIST-1"


@pytest.mark.asyncio
async def test_admin_lists_without_student_filter(async_client, async_db, captured, test_role):
    """Ma'muriyat nazorat ko'rinishida: filtr yo'q.

    ROYD baribir faqat bizning integratsiya yaratgan murojaatlarni
    qaytaradi, shuning uchun bu «hammasini ko'rish» emas.
    """
    from sqlalchemy import func, select

    from app.modules.auth.model import Role, User

    # «Admin» roli conftest fikstirasida allaqachon yaratilgan — qaytadan
    # qo'shsak, nom yakka bo'lgani uchun xato chiqadi.
    role = (
        await async_db.execute(select(Role).where(func.lower(Role.name) == "admin"))
    ).scalars().first()
    if role is None:
        role = Role(name="Admin")
        async_db.add(role)
        await async_db.flush()
    user = User(username="royd_admin", password="not-used", roles=[role])
    async_db.add(user)
    await async_db.commit()
    client = await _login(async_client, user.id)

    response = await client.get("/integration/royd/requests")

    assert response.status_code == 200, response.text
    assert "student_hemis_id" not in captured[0]["params"]


@pytest.mark.asyncio
async def test_file_field_is_named_upload(
    async_client, async_db, test_faculty, make_group, captured
):
    """ROYD `upload` maydonini kutadi, bizdagi odatiy `file` ni emas."""
    group = await make_group("IT-25", test_faculty["id"])
    user_id = await _make_student(async_db, "royd_file", group["id"], number="FILE-1")
    client = await _login(async_client, user_id)

    await client.post(
        "/integration/royd/requests/7/files",
        files={"file": ("ariza.pdf", b"%PDF-1.4 test", "application/pdf")},
    )

    assert "upload" in captured[0]["files"]


@pytest.mark.asyncio
async def test_resubmit_sends_comment(
    async_client, async_db, test_faculty, make_group, captured
):
    group = await make_group("IT-26", test_faculty["id"])
    user_id = await _make_student(async_db, "royd_resub", group["id"], number="RES-1")
    client = await _login(async_client, user_id)

    response = await client.post(
        "/integration/royd/requests/7/resubmit", json={"comment": "Nusxa yuklandi"}
    )

    assert response.status_code == 200, response.text
    assert captured[0]["path"] == "/requests/7/resubmit"
    assert captured[0]["json"] == {"comment": "Nusxa yuklandi"}


@pytest.mark.asyncio
async def test_student_without_group_gets_clear_error(async_client, async_db, captured):
    """Guruhsiz talaba — ROYD 422 qaytarardi, shuning uchun oldin to'xtatamiz."""
    from app.modules.auth.model import Role, Student, User

    role = Role(name="StudentNoGroup")
    user = User(username="royd_nogroup", password="not-used", roles=[role])
    async_db.add_all([role, user])
    await async_db.flush()
    async_db.add(
        Student(
            user_id=user.id,
            group_id=None,
            first_name="A",
            last_name="B",
            third_name="C",
            full_name="B A C",
            student_id_number="NOGROUP-1",
            image_path="",
            birth_date=date(2004, 1, 1),
            phone="",
            gender="male",
            university="NDKTU",
            specialty="Test",
            student_status="active",
            education_form="full_time",
            education_type="bachelor",
            payment_form="grant",
            education_lang="uz",
            faculty="Test",
            level="1",
            semester="1",
            address="Test",
            avg_gpa=0,
        )
    )
    await async_db.commit()
    client = await _login(async_client, user.id)

    response = await client.post(
        "/integration/royd/requests",
        json={"category_id": 1, "title": "Sarlavha", "description": "Matn"},
    )

    assert response.status_code == 409
    assert "fakultet" in response.json()["detail"].lower()
    assert captured == []


# ─────────────────────────────── Kurs ──────────────────────────────────
#
# `course` ROYD tomonida majburiy (1..7). Manba ikkita: guruhdagi butun son
# (EPOS) va talabaning `level` satri (HEMIS «3-kurs» deb yozadi).


@pytest.mark.asyncio
async def test_course_comes_from_group(
    async_client, async_db, test_faculty, make_group, captured
):
    from sqlalchemy import update

    from app.modules.organization_structure.model import Group

    group = await make_group("IT-31", test_faculty["id"])
    await async_db.execute(update(Group).where(Group.id == group["id"]).values(course=4))
    await async_db.commit()
    user_id = await _make_student(async_db, "royd_course", group["id"], number="CRS-1")
    client = await _login(async_client, user_id)

    await client.post(
        "/integration/royd/requests",
        json={"category_id": 1, "title": "Sarlavha", "description": "Matn"},
    )

    assert captured[0]["json"]["course"] == 4


@pytest.mark.asyncio
async def test_course_falls_back_to_hemis_level(
    async_client, async_db, test_faculty, make_group, captured
):
    """Guruhda kurs bo'lmasa — HEMIS «3-kurs» satridan olinadi."""
    from sqlalchemy import update

    from app.modules.auth.model import Student

    group = await make_group("IT-32", test_faculty["id"])  # `course` bo'sh
    user_id = await _make_student(async_db, "royd_level", group["id"], number="CRS-2")
    await async_db.execute(
        update(Student).where(Student.user_id == user_id).values(level="3-kurs")
    )
    await async_db.commit()
    client = await _login(async_client, user_id)

    await client.post(
        "/integration/royd/requests",
        json={"category_id": 1, "title": "Sarlavha", "description": "Matn"},
    )

    assert captured[0]["json"]["course"] == 3


@pytest.mark.asyncio
async def test_missing_course_is_refused_before_royd(
    async_client, async_db, test_faculty, make_group, captured
):
    """Kurs topilmasa ROYD'ga bormaymiz: u 422 qaytarardi va talaba
    tushunarsiz xatoni ko'rardi."""
    from sqlalchemy import update

    from app.modules.auth.model import Student

    group = await make_group("IT-33", test_faculty["id"])
    user_id = await _make_student(async_db, "royd_nocourse", group["id"], number="CRS-3")
    await async_db.execute(update(Student).where(Student.user_id == user_id).values(level=""))
    await async_db.commit()
    client = await _login(async_client, user_id)

    response = await client.post(
        "/integration/royd/requests",
        json={"category_id": 1, "title": "Sarlavha", "description": "Matn"},
    )

    assert response.status_code == 409
    assert "kurs" in response.json()["detail"].lower()
    assert captured == []
