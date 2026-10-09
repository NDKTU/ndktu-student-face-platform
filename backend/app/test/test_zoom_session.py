"""Zoom sahifasi: seans — havola + guruhlar + vaqt; kirishni server hal qiladi.

* boshqa guruh talabasi seansni ko'rmaydi va kira olmaydi;
* seans vaqtidan oldin (10 daqiqalik zaxiradan tashqari) va keyin kirib bo'lmaydi;
* yuz nazorati yoqilgan seansda imzo faqat `join` tekshiruvi `ok` dan keyin;
* etalon — faqat HEMIS surati; yuz xizmati ishlamasa — kirib bo'lmaydi;
* havola (`link_url`) talabaga berilmaydi; begona seansni o'zgartirib bo'lmaydi.
"""

from datetime import datetime, timedelta, timezone

import httpx
import jwt
import pytest
import pytest_asyncio
from core.config import settings
from sqlalchemy import select

from app.modules.zoom_session import repository as zoom_repository
from app.modules.zoom_session.model import ZoomFaceCheck
from app.test.test_student_dashboard import _login, _user
from app.test.test_student_teacher_scope import _student

LINK = "https://us05web.zoom.us/j/89012345678?pwd=abc123"
PHOTO = "https://example.test/hemis/student.jpg"


@pytest_asyncio.fixture
async def zoom_scene(async_db, auth_client, test_faculty, make_group, monkeypatch):
    from app.modules.auth.model import Permission, Role, RolePermission

    role = Role(name="zoom_student")
    async_db.add(role)
    await async_db.flush()
    for name in ("read:zoom_session", "join:zoom_session"):
        permission = (await async_db.execute(select(Permission).where(Permission.name == name))).scalar_one_or_none()
        if permission is None:
            permission = Permission(name=name)
            async_db.add(permission)
            await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    group = await make_group("ZM-101", test_faculty["id"])
    other_group = await make_group("ZM-202", test_faculty["id"])
    member = await _user(async_db, role, "zm_member")
    outsider = await _user(async_db, role, "zm_outsider")
    no_photo = await _user(async_db, role, "zm_nophoto")
    member_row = _student(member.id, group["id"], "ZM1", "Ali")
    member_row.image_path = PHOTO
    outsider_row = _student(outsider.id, other_group["id"], "ZM2", "Vali")
    outsider_row.image_path = PHOTO
    # Profilga o'zi yuklagan surat bor, HEMIS surati yo'q — etalon bo'lmaydi.
    no_photo.avatar_path = "https://example.test/profile/self.jpg"
    async_db.add_all([member_row, outsider_row, _student(no_photo.id, group["id"], "ZM3", "Soli")])
    await async_db.commit()

    monkeypatch.setattr(settings.zoom, "client_id", "test-sdk-key")
    monkeypatch.setattr(settings.zoom, "client_secret", "test-sdk-secret")
    return {"group_id": group["id"], "other_group_id": other_group["id"]}


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


async def _create(auth_client, group_id: int, *, start: timedelta, end: timedelta, face: bool = True) -> dict:
    created = await auth_client.post(
        "/zoom-sessions/",
        json={
            "title": "Jonli dars",
            "link_url": LINK,
            "starts_at": _iso(start),
            "ends_at": _iso(end),
            "group_ids": [group_id],
            "face_check_enabled": face,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def _fake_face(monkeypatch, *, status: str = "ok", fail: bool = False):
    calls: list[str] = []

    async def fake_verify(image_base64: str, reference_url: str) -> dict:
        calls.append(reference_url)
        if fail:
            raise httpx.ConnectError("down")
        return {
            "ok": {"face_count": 1, "is_match": True, "reference_ready": True},
            "different_person": {"face_count": 1, "is_match": False, "reference_ready": True},
        }[status]

    monkeypatch.setattr(zoom_repository, "verify_face", fake_verify)
    return calls


async def _check(async_client, session_id: int, headers: dict, stage: str = "join"):
    return await async_client.post(
        f"/zoom-sessions/{session_id}/face-check", json={"image_base64": "AAAA", "stage": stage}, headers=headers
    )


@pytest.mark.asyncio
async def test_member_joins_after_face_check(auth_client, async_client, zoom_scene, monkeypatch):
    zs = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=-5), end=timedelta(hours=1))
    headers = await _login(async_client, "zm_member")

    listed = await async_client.get("/zoom-sessions/", headers=headers)
    assert [s["id"] for s in listed.json()["sessions"]] == [zs["id"]]
    # Havola talabaga berilmaydi — u bilan Zoom ilovasi orqali LMS'ni chetlab o'tardi.
    assert listed.json()["sessions"][0]["link_url"] is None
    assert listed.json()["sessions"][0]["status"] == "open"

    blocked = await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "face_verification_required"

    calls = _fake_face(monkeypatch)
    checked = await _check(async_client, zs["id"], headers)
    assert checked.json()["admitted"] is True
    assert calls == [PHOTO]

    joined = await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)
    assert joined.status_code == 200, joined.text
    body = joined.json()
    assert body["meeting_number"] == "89012345678"
    assert "join_url" not in body
    assert body["user_name"] == "Ali Talaba T · ZM-101"
    claims = jwt.decode(body["signature"], "test-sdk-secret", algorithms=["HS256"])
    assert claims["mn"] == "89012345678" and claims["role"] == 0


@pytest.mark.asyncio
async def test_mismatch_does_not_admit(auth_client, async_client, zoom_scene, monkeypatch):
    zs = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=-5), end=timedelta(hours=1))
    headers = await _login(async_client, "zm_member")
    _fake_face(monkeypatch, status="different_person")

    checked = await _check(async_client, zs["id"], headers)
    assert checked.json()["status"] == "different_person"
    assert checked.json()["admitted"] is False
    assert (await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_face_service_down_blocks_entry(auth_client, async_client, zoom_scene, monkeypatch):
    zs = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=-5), end=timedelta(hours=1))
    headers = await _login(async_client, "zm_member")
    _fake_face(monkeypatch, fail=True)

    checked = await _check(async_client, zs["id"], headers)
    assert checked.status_code == 503
    assert checked.json()["detail"]["code"] == "face_service_unavailable"
    assert (await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_other_group_cannot_see_or_join(auth_client, async_client, zoom_scene, monkeypatch):
    zs = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=-5), end=timedelta(hours=1))
    headers = await _login(async_client, "zm_outsider")
    _fake_face(monkeypatch)

    assert (await async_client.get("/zoom-sessions/", headers=headers)).json()["sessions"] == []
    assert (await async_client.get(f"/zoom-sessions/{zs['id']}", headers=headers)).status_code == 404
    checked = await _check(async_client, zs["id"], headers)
    assert checked.status_code == 403
    assert checked.json()["detail"]["code"] == "zoom_not_your_group"
    joined = await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)
    assert joined.json()["detail"]["code"] == "zoom_not_your_group"


@pytest.mark.asyncio
async def test_time_window(auth_client, async_client, zoom_scene, monkeypatch):
    headers = await _login(async_client, "zm_member")
    _fake_face(monkeypatch)

    later = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=30), end=timedelta(hours=2))
    early = await _check(async_client, later["id"], headers)
    assert early.json()["detail"]["code"] == "zoom_session_not_open"

    # 10 daqiqalik zaxira ichida — kirish ochiq.
    soon = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=5), end=timedelta(hours=2))
    assert (await _check(async_client, soon["id"], headers)).json()["admitted"] is True

    past = await _create(auth_client, zoom_scene["group_id"], start=timedelta(hours=-3), end=timedelta(minutes=-1))
    closed = await async_client.post(f"/zoom-sessions/{past['id']}/join", headers=headers)
    assert closed.json()["detail"]["code"] == "zoom_session_closed"


@pytest.mark.asyncio
async def test_self_uploaded_photo_is_not_a_reference(auth_client, async_client, zoom_scene, monkeypatch):
    zs = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=-5), end=timedelta(hours=1))
    headers = await _login(async_client, "zm_nophoto")
    calls = _fake_face(monkeypatch)

    checked = await _check(async_client, zs["id"], headers)
    assert checked.status_code == 400
    assert checked.json()["detail"]["code"] == "student_photo_missing"
    assert calls == []


@pytest.mark.asyncio
async def test_without_face_check_join_is_direct(auth_client, async_client, zoom_scene):
    zs = await _create(
        auth_client, zoom_scene["group_id"], start=timedelta(minutes=-5), end=timedelta(hours=1), face=False
    )
    headers = await _login(async_client, "zm_member")
    assert (await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_report_lists_absent_students(auth_client, async_client, async_db, zoom_scene, monkeypatch):
    zs = await _create(auth_client, zoom_scene["group_id"], start=timedelta(minutes=-5), end=timedelta(hours=1))
    headers = await _login(async_client, "zm_member")
    _fake_face(monkeypatch)
    await _check(async_client, zs["id"], headers)
    await _check(async_client, zs["id"], headers, stage="random")

    report = await auth_client.get(f"/zoom-sessions/{zs['id']}/report")
    assert report.status_code == 200, report.text
    by_name = {s["user_name"]: s for s in report.json()["students"]}
    assert by_name["Ali Talaba T"]["joined"] is True
    assert by_name["Ali Talaba T"]["passed"] == 2
    # Guruhda bor, lekin kirmagan — hisobotda ko'rinadi.
    assert by_name["Soli Talaba T"]["joined"] is False
    assert "Vali Talaba T" not in by_name

    rows = (await async_db.execute(select(ZoomFaceCheck).where(ZoomFaceCheck.session_id == zs["id"]))).scalars().all()
    assert {row.stage for row in rows} == {"join", "random"}


@pytest.mark.asyncio
async def test_validation_and_ownership(auth_client, async_client, zoom_scene):
    bad_time = await auth_client.post(
        "/zoom-sessions/",
        json={
            "title": "X",
            "link_url": LINK,
            "starts_at": _iso(timedelta(hours=2)),
            "ends_at": _iso(timedelta(hours=1)),
            "group_ids": [zoom_scene["group_id"]],
        },
    )
    assert bad_time.status_code == 422

    bad_link = await auth_client.post(
        "/zoom-sessions/",
        json={
            "title": "X",
            "link_url": "https://example.com/not-zoom",
            "starts_at": _iso(timedelta(hours=1)),
            "ends_at": _iso(timedelta(hours=2)),
            "group_ids": [zoom_scene["group_id"]],
        },
    )
    assert bad_link.status_code == 422

    zs = await _create(auth_client, zoom_scene["group_id"], start=timedelta(hours=1), end=timedelta(hours=2))
    assert zs["link_url"] == LINK  # yaratuvchi havolani ko'radi
    headers = await _login(async_client, "zm_member")
    # Talabada boshqaruv ruxsati yo'q.
    assert (await async_client.delete(f"/zoom-sessions/{zs['id']}", headers=headers)).status_code == 403
    assert (await auth_client.delete(f"/zoom-sessions/{zs['id']}")).status_code == 204
