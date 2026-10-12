"""Bir nechta Zoom akkaunti: har akkauntning o'z ilovalari bor.

* sirlar javobda qaytmaydi, tahrirda bo'sh sir saqlanganini o'zgartirmaydi;
* uchrashuv bo'sh akkauntda yaratiladi, hammasi band bo'lsa — 409;
* talaba uchrashuv egasi akkauntining SDK kaliti bilan imzolanadi (aks
  holda Zoom 4011 qaytaradi);
* qo'lda qo'yilgan havolaning egasi API orqali aniqlanadi;
* webhook imzosi qaysi akkaunt siriga mos kelsa — o'shaniki.
"""

from datetime import timedelta

import jwt
import pytest
import pytest_asyncio
from core.config import settings
from sqlalchemy import select

from app.modules.zoom_session.model import ZoomAccount, ZoomSession
from app.test.test_student_dashboard import _login
from app.test.test_zoom_api import _create_managed, _participant_event, _signed, _zoom_iso, zoom_cloud  # noqa: F401
from app.test.test_zoom_session import _iso, _teaching, zoom_scene  # noqa: F401


def _account(name: str, **overrides) -> dict:
    body = {
        "name": name,
        "host_email": f"host-{name}@nsumt.uz",
        "api_account_id": f"acc-{name}",
        "api_client_id": f"cid-{name}",
        "api_client_secret": f"csecret-{name}",
        "sdk_key": f"sdk-{name}",
        "sdk_secret": f"sdk-secret-{name}",
        "webhook_secret_token": f"hook-{name}",
    }
    body.update(overrides)
    return body


@pytest_asyncio.fixture
async def two_accounts(auth_client, zoom_cloud, monkeypatch):  # noqa: F811
    """`.env` o'chiq, jadvalda ikki akkaunt: A va B."""
    for field in ("api_account_id", "client_id", "webhook_secret_token"):
        monkeypatch.setattr(settings.zoom, field, "")
    created = []
    for name in ("A", "B"):
        response = await auth_client.post("/zoom-accounts/", json=_account(name))
        assert response.status_code == 201, response.text
        created.append(response.json())
    return {**zoom_cloud, "a": created[0], "b": created[1]}


@pytest.mark.asyncio
async def test_secrets_are_write_only(auth_client, async_db, two_accounts):
    listed = (await auth_client.get("/zoom-accounts/")).json()["accounts"]
    assert [a["name"] for a in listed] == ["A", "B"]  # `.env` o'chiq — ro'yxatda yo'q
    text = str(listed)
    assert "csecret-A" not in text and "sdk-secret-A" not in text and "hook-A" not in text
    assert listed[0]["has_api_secret"] and listed[0]["has_sdk_secret"] and listed[0]["has_webhook_secret"]

    row = await async_db.get(ZoomAccount, two_accounts["a"]["id"])
    assert row.sdk_secret_encrypted != "sdk-secret-A"

    # Bo'sh sir — saqlangani qoladi.
    updated = await auth_client.put(
        f"/zoom-accounts/{two_accounts['a']['id']}",
        json=_account("A2", api_client_secret=None, sdk_secret="", webhook_secret_token=None),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "A2" and updated.json()["has_sdk_secret"] is True

    # API yarim sozlangan — rad etiladi.
    partial = await auth_client.post("/zoom-accounts/", json=_account("C", host_email=None))
    assert partial.json()["detail"]["code"] == "zoom_account_incomplete_api"
    # Faqat SDK — ruxsat (havola bilan seans uchun yetarli).
    sdk_only = await auth_client.post(
        "/zoom-accounts/",
        json=_account("D", host_email=None, api_account_id=None, api_client_id=None, api_client_secret=None),
    )
    assert sdk_only.status_code == 201 and sdk_only.json()["api_enabled"] is False

    duplicate = await auth_client.post("/zoom-accounts/", json=_account("b"))
    assert duplicate.json()["detail"]["code"] == "zoom_account_name_taken"


@pytest.mark.asyncio
async def test_meetings_spread_over_free_accounts(auth_client, async_db, two_accounts):
    capabilities = (await auth_client.get("/zoom-sessions/capabilities")).json()
    assert [(a["name"], a["auto_create"]) for a in capabilities["accounts"]] == [("A", True), ("B", True)]

    first = await _create_managed(auth_client, two_accounts)
    second = await _create_managed(auth_client, two_accounts)
    assert (first["zoom_account_name"], second["zoom_account_name"]) == ("A", "B")
    assert two_accounts["accounts"][:2] == ["A", "B"]

    # Ikkala host ham shu vaqtda band.
    third = await auth_client.post(
        "/zoom-sessions/",
        json={
            "title": "Uchinchi",
            "starts_at": _iso(timedelta(minutes=30)),
            "ends_at": _iso(timedelta(hours=2)),
            "group_ids": [two_accounts["group_id"]],
            **_teaching(two_accounts),
        },
    )
    assert third.status_code == 409
    assert third.json()["detail"]["code"] == "zoom_no_free_account"

    # Band akkauntni qo'lda tanlash ham — 409; boshqa vaqtda esa bo'ladi.
    body = {
        "title": "Kechqurun",
        "starts_at": _iso(timedelta(hours=3)),
        "ends_at": _iso(timedelta(hours=4)),
        "group_ids": [two_accounts["group_id"]],
            **_teaching(two_accounts),
        "zoom_account_id": two_accounts["b"]["id"],
    }
    later = await auth_client.post("/zoom-sessions/", json=body)
    assert later.status_code == 201 and later.json()["zoom_account_name"] == "B"
    body.update(starts_at=_iso(timedelta(minutes=10)), ends_at=_iso(timedelta(minutes=50)))
    assert (await auth_client.post("/zoom-sessions/", json=body)).json()["detail"]["code"] == "zoom_account_busy"

    # Seansi bor akkaunt o'chirilmaydi.
    removed = await auth_client.delete(f"/zoom-accounts/{two_accounts['a']['id']}")
    assert removed.json()["detail"]["code"] == "zoom_account_in_use"


@pytest.mark.asyncio
async def test_student_signed_with_owner_account_sdk(auth_client, async_client, two_accounts):
    await _create_managed(auth_client, two_accounts, face=False)
    on_b = await _create_managed(auth_client, two_accounts, face=False)
    assert on_b["zoom_account_name"] == "B"

    headers = await _login(async_client, "zm_member")
    body = (await async_client.post(f"/zoom-sessions/{on_b['id']}/join", headers=headers)).json()
    assert body["sdk_key"] == "sdk-B"
    claims = jwt.decode(body["signature"], "sdk-secret-B", algorithms=["HS256"])
    assert claims["appKey"] == "sdk-B"
    # Registrant ham B akkauntida.
    assert two_accounts["accounts"][-1] == "B"


@pytest.mark.asyncio
async def test_manual_link_owner_detected(auth_client, two_accounts):
    two_accounts["owners"].add("B")
    body = {
        "title": "Havola",
        "link_url": "https://us06web.zoom.us/j/89012345678?pwd=x",
        "starts_at": _iso(timedelta(hours=1)),
        "ends_at": _iso(timedelta(hours=2)),
        "group_ids": [two_accounts["group_id"]],
            **_teaching(two_accounts),
    }
    created = await auth_client.post("/zoom-sessions/", json=body)
    assert created.status_code == 201, created.text
    assert created.json()["zoom_account_name"] == "B"

    # Hech bir akkauntda topilmadi — taxmin qilinmaydi.
    two_accounts["owners"].clear()
    two_accounts["owners"].add("nobody")
    unknown = await auth_client.post("/zoom-sessions/", json=body)
    assert unknown.json()["detail"]["code"] == "zoom_account_required"
    # Qo'lda tanlansa — bo'ladi.
    chosen = await auth_client.post("/zoom-sessions/", json={**body, "zoom_account_id": two_accounts["a"]["id"]})
    assert chosen.json()["zoom_account_name"] == "A"


@pytest.mark.asyncio
async def test_webhook_signed_by_any_account(auth_client, async_client, async_db, two_accounts):
    zs = await _create_managed(auth_client, two_accounts, face=False)
    event = _participant_event(
        "meeting.participant_joined",
        {"participant_uuid": "x-1", "user_name": "Begona", "join_time": _zoom_iso(timedelta(minutes=-2))},
    )
    raw, headers = _signed(event, secret="hook-B")
    response = await async_client.post("/zoom/webhook", content=raw, headers=headers)
    assert response.status_code == 200 and response.json() == {"accepted": True}

    raw, headers = _signed(event, secret="hook-unknown")
    assert (await async_client.post("/zoom/webhook", content=raw, headers=headers)).status_code == 401

    report = (await auth_client.get(f"/zoom-sessions/{zs['id']}/report")).json()
    assert [o["name"] for o in report["outsiders"]] == ["Begona"]
    stored = (await async_db.execute(select(ZoomSession.zoom_account_id))).scalars().all()
    assert stored == [two_accounts["a"]["id"]]
