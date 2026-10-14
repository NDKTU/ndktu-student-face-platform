"""Zoom API (Server-to-Server OAuth): uchrashuvni bekend yaratadi, talaba
registrant bo'lib shaxsiy `tk` bilan kiradi, webhook davomatni yozadi.

Zoom'ning o'zi chaqirilmaydi — `zoom_api` metodlari ushlab qolinadi va
biz nima yuborayotganimizni hamda javobni qanday ishlatayotganimizni
tekshiramiz.
"""

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import pytest_asyncio
from core.config import settings
from sqlalchemy import select

from app.modules.zoom_session.accounts import ZoomCredentials
from app.modules.zoom_session.model import ZoomParticipantEvent, ZoomRegistrant, ZoomSession
from app.modules.zoom_session.zoom_api import ZoomApiError, registrant_token, zoom_api
from app.test.test_student_dashboard import _login
from app.test.test_zoom_session import _fake_face, _iso, _teaching, zoom_scene  # noqa: F401

SECRET = "test-webhook-secret"
MEETING_ID = 81234567890


@pytest_asyncio.fixture
async def zoom_cloud(zoom_scene, monkeypatch):  # noqa: F811
    """API yoqilgan va Zoom chaqiruvlari yozib boriladi."""
    monkeypatch.setattr(settings.zoom, "api_account_id", "acc")
    monkeypatch.setattr(settings.zoom, "api_client_id", "cid")
    monkeypatch.setattr(settings.zoom, "api_client_secret", "csecret")
    monkeypatch.setattr(settings.zoom, "api_host_user", "host@nsumt.uz")
    monkeypatch.setattr(settings.zoom, "webhook_secret_token", SECRET)
    calls: list[tuple] = []
    #: Har chaqiruv qaysi akkaunt kaliti bilan ketgani (`calls` bilan bir tartibda).
    accounts: list[str] = []
    #: `get_meeting` qaysi akkauntlarda uchrashuvni «topadi» (bo'sh — hammasida).
    owners: set[str] = set()

    async def create_meeting(creds, topic, starts_at, ends_at):
        calls.append(("create", topic, starts_at, ends_at))
        accounts.append(creds.name)
        return {"id": MEETING_ID, "join_url": f"https://us06web.zoom.us/j/{MEETING_ID}?pwd=Secret1", "password": "x"}

    async def update_meeting(creds, meeting_id, topic, starts_at, ends_at):
        calls.append(("update", meeting_id, topic))
        accounts.append(creds.name)

    async def delete_meeting(creds, meeting_id):
        calls.append(("delete", meeting_id))
        accounts.append(creds.name)

    async def get_meeting(creds, meeting_id):
        calls.append(("get", meeting_id))
        accounts.append(creds.name)
        if owners and creds.name not in owners:
            raise ZoomApiError(404, 3001, "Meeting does not exist")
        return {"id": meeting_id, "start_url": "https://us06web.zoom.us/s/81234567890?zak=ZAK"}

    async def add_registrant(creds, meeting_id, *, email, first_name, last_name):
        calls.append(("register", meeting_id, email, first_name, last_name))
        accounts.append(creds.name)
        return {
            "registrant_id": f"reg-{email.split('@')[0]}",
            "join_url": f"https://us06web.zoom.us/w/{meeting_id}?tk=TOKEN-{email.split('@')[0]}&pwd=Secret1",
        }

    for name, fn in {
        "create_meeting": create_meeting,
        "update_meeting": update_meeting,
        "delete_meeting": delete_meeting,
        "get_meeting": get_meeting,
        "add_registrant": add_registrant,
    }.items():
        monkeypatch.setattr(zoom_api, name, fn)
    return {**zoom_scene, "calls": calls, "accounts": accounts, "owners": owners}


async def _create_managed(auth_client, scene: dict, *, face: bool = True, **extra) -> dict:
    created = await auth_client.post(
        "/zoom-sessions/",
        json={
            "title": "Avto dars",
            "starts_at": _iso(timedelta(minutes=-5)),
            "ends_at": _iso(timedelta(hours=1)),
            "group_ids": [scene["group_id"]],
            **_teaching(scene),
            **extra,
            "face_check_enabled": face,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def _signed(body: dict, secret: str = SECRET) -> tuple[bytes, dict]:
    raw = json.dumps(body).encode()
    timestamp = "1760000000"
    digest = hmac.new(secret.encode(), f"v0:{timestamp}:{raw.decode()}".encode(), hashlib.sha256).hexdigest()
    return raw, {
        "x-zm-request-timestamp": timestamp,
        "x-zm-signature": f"v0={digest}",
        "content-type": "application/json",
    }


def _participant_event(event: str, participant: dict, meeting_id: int = MEETING_ID) -> dict:
    return {"event": event, "event_ts": 1, "payload": {"object": {"id": str(meeting_id), "participant": participant}}}


def _zoom_iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).strftime("%Y-%m-%dT%H:%M:%SZ")


def test_registrant_token_is_taken_from_join_url():
    assert registrant_token("https://zoom.us/w/812?tk=abc.def&pwd=1") == "abc.def"
    assert registrant_token("https://zoom.us/j/812?pwd=1") is None


@pytest.mark.asyncio
async def test_capabilities_follow_config(auth_client, zoom_scene, monkeypatch):  # noqa: F811
    # Lokal `.env` da kalitlar bo'lishi mumkin — test undan qat'i nazar.
    monkeypatch.setattr(settings.zoom, "api_account_id", "")
    monkeypatch.setattr(settings.zoom, "client_id", "")
    assert (await auth_client.get("/zoom-sessions/capabilities")).json() == {"auto_create": False, "accounts": []}
    # API sozlanmagan — havolasiz seans yaratib bo'lmaydi.
    created = await auth_client.post(
        "/zoom-sessions/",
        json={
            "title": "X",
            "link_url": "",
            "starts_at": _iso(timedelta(hours=1)),
            "ends_at": _iso(timedelta(hours=2)),
            "group_ids": [zoom_scene["group_id"]],
            **_teaching(zoom_scene),
        },
    )
    assert created.status_code == 422
    assert created.json()["detail"]["code"] == "zoom_link_required"


@pytest.mark.asyncio
async def test_session_without_link_creates_zoom_meeting(auth_client, async_db, zoom_cloud):
    assert (await auth_client.get("/zoom-sessions/capabilities")).json() == {
        "auto_create": True,
        "accounts": [{"id": 0, "name": "Asosiy (.env)", "auto_create": True}],
    }
    zs = await _create_managed(auth_client, zoom_cloud)
    assert zs["zoom_managed"] is True
    assert zs["link_url"].startswith(f"https://us06web.zoom.us/j/{MEETING_ID}")
    assert [c[0] for c in zoom_cloud["calls"]] == ["create"]

    row = await async_db.get(ZoomSession, zs["id"])
    assert row.zoom_meeting_id == MEETING_ID

    # Vaqt o'zgardi — Zoom ham yangilanadi; havolani almashtirib bo'lmaydi.
    updated = await auth_client.put(
        f"/zoom-sessions/{zs['id']}",
        json={
            "title": "Yangi nom",
            "link_url": "https://us05web.zoom.us/j/89012345678?pwd=other",
            "starts_at": _iso(timedelta(minutes=-5)),
            "ends_at": _iso(timedelta(hours=2)),
            "group_ids": [zoom_cloud["group_id"]],
            **_teaching(zoom_cloud),
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["link_url"] == zs["link_url"]
    assert ("update", MEETING_ID, "Yangi nom") in zoom_cloud["calls"]

    started = await auth_client.post(f"/zoom-sessions/{zs['id']}/start")
    assert started.json()["start_url"].endswith("zak=ZAK")

    assert (await auth_client.delete(f"/zoom-sessions/{zs['id']}")).status_code == 204
    assert ("delete", MEETING_ID) in zoom_cloud["calls"]


@pytest.mark.asyncio
async def test_zoom_failure_does_not_create_session(auth_client, async_db, zoom_cloud, monkeypatch):
    async def broken(*args, **kwargs):
        raise ZoomApiError(400, 1001, "User does not exist")

    monkeypatch.setattr(zoom_api, "create_meeting", broken)
    created = await auth_client.post(
        "/zoom-sessions/",
        json={
            "title": "X",
            "starts_at": _iso(timedelta(hours=1)),
            "ends_at": _iso(timedelta(hours=2)),
            "group_ids": [zoom_cloud["group_id"]],
            **_teaching(zoom_cloud),
        },
    )
    assert created.status_code == 502
    assert created.json()["detail"]["code"] == "zoom_api_error"
    assert (await async_db.execute(select(ZoomSession))).scalars().all() == []


@pytest.mark.asyncio
async def test_student_gets_personal_token_after_face_check(auth_client, async_client, async_db, zoom_cloud, monkeypatch):
    zs = await _create_managed(auth_client, zoom_cloud)
    headers = await _login(async_client, "zm_member")

    # Yuz tasdig'isiz registrant ham qo'shilmaydi.
    assert (await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)).status_code == 403
    assert not [c for c in zoom_cloud["calls"] if c[0] == "register"]

    _fake_face(monkeypatch)
    await async_client.post(
        f"/zoom-sessions/{zs['id']}/face-check", json={"image_base64": "AAAA", "stage": "join"}, headers=headers
    )
    joined = await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)
    assert joined.status_code == 200, joined.text
    body = joined.json()
    user_id = int(body["customer_key"].removeprefix("lms-"))
    assert body["registrant_token"] == f"TOKEN-lms-{user_id}"
    register = [c for c in zoom_cloud["calls"] if c[0] == "register"]
    assert register == [("register", MEETING_ID, f"lms-{user_id}@lms.nsumt.uz", "Ali Talaba T", "ZM-101")]

    # Kompyuterda ilova havolasi berilmaydi — tasodifiy yuz tekshiruvidan qochish yo'li bo'lardi.
    assert body["app_join_url"] is None

    # Qayta kirish — token bazadan, Zoom'ga yana murojaat yo'q.
    again = await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)
    assert again.json()["registrant_token"] == body["registrant_token"]

    # Telefondan: SDK u yerda ishlamaydi — Zoom ilovasiga shaxsiy havola.
    mobile = await async_client.post(f"/zoom-sessions/{zs['id']}/join?app=1", headers=headers)
    assert mobile.json()["app_join_url"] == (
        f"https://us06web.zoom.us/w/{MEETING_ID}?tk=TOKEN-lms-{user_id}&pwd=Secret1"
    )
    assert len([c for c in zoom_cloud["calls"] if c[0] == "register"]) == 1
    rows = (await async_db.execute(select(ZoomRegistrant))).scalars().all()
    assert [(r.user_id, r.registrant_id) for r in rows] == [(user_id, f"reg-lms-{user_id}")]


@pytest.mark.asyncio
async def test_teacher_joins_on_page_as_host(auth_client, async_client, zoom_cloud, monkeypatch):
    """O'qituvchi sahifaning o'zida host: `role: 1` + ZAK, registrant emas.

    13.10 da u registrant-ishtirokchi bo'lib kirgan — `mute_upon_entry` uni
    ovozsiz qoldirgan, uchrashuv esa hostsiz o'tgan.
    """
    zs = await _create_managed(auth_client, zoom_cloud)
    headers = await _login(async_client, "zm_teacher")
    joined = await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)
    assert joined.status_code == 200, joined.text
    body = joined.json()
    assert body["zak"] == "ZAK"
    assert body["registrant_token"] is None
    claims = jwt.decode(body["signature"], options={"verify_signature": False})
    assert claims["role"] == 1
    assert not [c for c in zoom_cloud["calls"] if c[0] == "register"]

    # Admin boshqaradi, lekin host emas — ikkinchi host o'qituvchini chiqarib yuborardi.
    admin = (await auth_client.post(f"/zoom-sessions/{zs['id']}/join")).json()
    assert admin["zak"] is None
    assert jwt.decode(admin["signature"], options={"verify_signature": False})["role"] == 0

    # ZAK kelmasa ishtirokchi bo'lib kiritilmaydi — aynan o'sha ovozsiz dars bo'lardi.
    async def no_zak(creds, meeting_id):
        return {"id": meeting_id, "start_url": f"https://us06web.zoom.us/s/{meeting_id}"}

    monkeypatch.setattr(zoom_api, "get_meeting", no_zak)
    failed = await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)
    assert failed.status_code == 502
    assert failed.json()["detail"]["code"] == "zoom_api_error"


@pytest.mark.asyncio
async def test_webhook_url_validation_and_signature(async_client, zoom_cloud):
    raw, headers = _signed({"event": "endpoint.url_validation", "payload": {"plainToken": "plain123"}})
    response = await async_client.post("/zoom/webhook", content=raw, headers=headers)
    assert response.status_code == 200
    expected = hmac.new(SECRET.encode(), b"plain123", hashlib.sha256).hexdigest()
    assert response.json() == {"plainToken": "plain123", "encryptedToken": expected}

    raw, headers = _signed({"event": "endpoint.url_validation", "payload": {"plainToken": "x"}}, secret="wrong")
    assert (await async_client.post("/zoom/webhook", content=raw, headers=headers)).status_code == 401
    assert (await async_client.post("/zoom/webhook", content=raw)).status_code == 401


@pytest.mark.asyncio
async def test_webhook_attendance_in_report(auth_client, async_client, async_db, zoom_cloud, monkeypatch):
    zs = await _create_managed(auth_client, zoom_cloud, face=False)
    headers = await _login(async_client, "zm_member")
    body = (await async_client.post(f"/zoom-sessions/{zs['id']}/join", headers=headers)).json()
    user_id = int(body["customer_key"].removeprefix("lms-"))

    student = {"participant_uuid": "p-1", "user_name": "Ali", "registrant_id": f"reg-lms-{user_id}"}
    outsider = {"participant_uuid": "p-2", "user_name": "Begona odam"}
    host = {"participant_uuid": "p-3", "user_name": "Host", "email": "HOST@nsumt.uz"}
    events = [
        _participant_event("meeting.participant_joined", {**student, "join_time": _zoom_iso(timedelta(minutes=-4))}),
        _participant_event("meeting.participant_left", {**student, "leave_time": _zoom_iso(timedelta(minutes=-1))}),
        _participant_event("meeting.participant_joined", {**outsider, "join_time": _zoom_iso(timedelta(minutes=-3))}),
        _participant_event("meeting.participant_joined", {**host, "join_time": _zoom_iso(timedelta(minutes=-5))}),
        # Boshqa uchrashuv — e'tiborga olinmaydi.
        _participant_event(
            "meeting.participant_joined", {**outsider, "join_time": _zoom_iso(timedelta(minutes=-3))}, meeting_id=1
        ),
    ]
    for event in events + events[:1]:  # birinchisi takror yuborildi
        raw, signed = _signed(event)
        assert (await async_client.post("/zoom/webhook", content=raw, headers=signed)).status_code == 200

    stored = (await async_db.execute(select(ZoomParticipantEvent))).scalars().all()
    assert len(stored) == 3

    report = (await auth_client.get(f"/zoom-sessions/{zs['id']}/report")).json()
    assert report["zoom_tracked"] is True
    by_name = {s["user_name"]: s for s in report["students"]}
    ali = by_name["Ali Talaba T"]
    assert ali["joined"] is True and ali["total"] == 0
    assert 170 <= ali["zoom_seconds"] <= 190
    assert by_name["Soli Talaba T"]["joined"] is False
    assert [o["name"] for o in report["outsiders"]] == ["Begona odam"]
    assert report["outsiders"][0]["seconds"] >= 170


@pytest.mark.asyncio
async def test_meeting_body_lets_students_in_before_host(monkeypatch):
    """Talaba o'qituvchini kutmaydi; ro'yxatdan o'tish esa qo'lda tasdiqlanadi."""
    from app.modules.zoom_session.zoom_api import ZoomApiClient

    client = ZoomApiClient()
    sent: list[tuple[str, str, dict]] = []

    async def fake_request(creds, method, path, *, json=None):
        sent.append((method, path, json))
        return {"id": 1, "join_url": "https://zoom.us/j/123456789"}

    monkeypatch.setattr(client, "request", fake_request)
    creds = ZoomCredentials(id=None, name="t", host_user="host@nsumt.uz")
    start = datetime(2026, 10, 10, 7, 0)
    await client.create_meeting(creds, "Dars", start, start + timedelta(minutes=80))
    await client.update_meeting(creds, 1, "Dars", start, start + timedelta(minutes=90))

    created, updated = sent[0][2], sent[1][2]
    assert sent[0][1] == "/users/host@nsumt.uz/meetings"
    assert created["settings"]["join_before_host"] is True
    assert created["settings"]["approval_type"] == 1
    assert created["duration"] == 80 and created["start_time"] == "2026-10-10T07:00:00Z"
    # Yangilash ham yoqadi — ilgari `join_before_host=false` bilan yaratilganlar o'tsin.
    assert updated["settings"]["join_before_host"] is True
    assert "approval_type" not in updated["settings"]
