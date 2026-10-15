"""Zoom seanslari seriyasi: har hafta / har 2 haftada takrorlanadigan darslar.

Har bir sana — alohida seans va alohida Zoom uchrashuvi, umumiy `series_id`
bilan. Tekshiriladi: sanalar to'g'ri hisoblanadi (o'tkazib yuboriladigan
kunlar bilan), band akkaunt butun seriyani to'xtatmaydi, «shu va
keyingilari» faqat keyingilarni o'zgartiradi va o'chiradi.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.modules.zoom_session.model import ZoomSession
from app.test.test_zoom_api import _create_managed, zoom_cloud  # noqa: F401
from app.test.test_zoom_session import _teaching, zoom_scene  # noqa: F401


def _first_start() -> datetime:
    """Ertaga, daqiqasiz — sanalarni hisoblash oson bo'lsin (UTC)."""
    return (datetime.now(timezone.utc) + timedelta(days=1)).replace(second=0, microsecond=0)


def _tashkent_date(value: datetime) -> date:
    return (value + timedelta(hours=5)).date()


def _series_body(scene: dict, start: datetime, *, repeat: str, until_days: int, skip: list[date] | None = None):
    return {
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(minutes=80)).isoformat(),
        "group_ids": [scene["group_id"]],
        **_teaching(scene),
        "repeat": repeat,
        "repeat_until": (_tashkent_date(start) + timedelta(days=until_days)).isoformat(),
        "skip_dates": [d.isoformat() for d in (skip or [])],
    }


async def _count(async_db) -> int:
    return (await async_db.execute(select(func.count()).select_from(ZoomSession))).scalar_one()


@pytest.mark.asyncio
async def test_biweekly_series_with_skipped_date(auth_client, zoom_cloud):  # noqa: F811
    start = _first_start()
    holiday = _tashkent_date(start) + timedelta(days=28)
    response = await auth_client.post(
        "/zoom-sessions/series",
        json=_series_body(zoom_cloud, start, repeat="biweekly", until_days=42, skip=[holiday]),
    )
    assert response.status_code == 201, response.text
    body = response.json()

    # 0, 14, 28, 42-kunlar; 28-kun — bayram.
    starts = [datetime.fromisoformat(s["starts_at"]) for s in body["created"]]
    assert [(s - starts[0]).days for s in starts] == [0, 14, 42]
    assert body["failed"] == []
    assert {s["series_id"] for s in body["created"]} == {body["series_id"]}
    # Nom qo'lda yozilmaydi — fan, o'qituvchi va guruhdan.
    assert body["created"][0]["title"] == "Fizika — Aliyev V.S. (ZM-101)"

    listed = (await auth_client.get("/zoom-sessions/", params={"scope": "upcoming"})).json()["sessions"]
    assert [(s["series_position"], s["series_total"]) for s in listed] == [(1, 3), (2, 3), (3, 3)]
    assert [c[0] for c in zoom_cloud["calls"]].count("create") == 3


@pytest.mark.asyncio
async def test_busy_week_fails_alone(auth_client, zoom_cloud):  # noqa: F811
    """Bitta haftada akkaunt band — o'sha sana `failed`, qolganlari yaratiladi."""
    start = _first_start()
    week_two = start + timedelta(days=7)
    busy = await auth_client.post(
        "/zoom-sessions/",
        json={
            "starts_at": week_two.isoformat(),
            "ends_at": (week_two + timedelta(minutes=80)).isoformat(),
            "group_ids": [zoom_cloud["other_group_id"]],
            **_teaching(zoom_cloud),
        },
    )
    assert busy.status_code == 201, busy.text

    response = await auth_client.post(
        "/zoom-sessions/series", json=_series_body(zoom_cloud, start, repeat="weekly", until_days=14)
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["created"]) == 2
    assert len(body["failed"]) == 1
    assert datetime.fromisoformat(body["failed"][0]["starts_at"]) == week_two
    assert body["failed"][0]["reason"]


@pytest.mark.asyncio
async def test_invalid_series_creates_nothing(auth_client, async_db, zoom_cloud):  # noqa: F811
    start = _first_start()
    foreign = {**_series_body(zoom_cloud, start, repeat="weekly", until_days=14), "subject_id": zoom_cloud["foreign_subject_id"]}
    response = await auth_client.post("/zoom-sessions/series", json=foreign)
    assert response.status_code in (400, 403, 422), response.text
    assert await _count(async_db) == 0
    assert zoom_cloud["calls"] == []

    too_long = await auth_client.post(
        "/zoom-sessions/series", json=_series_body(zoom_cloud, start, repeat="weekly", until_days=7 * 40)
    )
    assert too_long.status_code == 422


@pytest.mark.asyncio
async def test_update_and_delete_following(auth_client, async_db, zoom_cloud):  # noqa: F811
    start = _first_start()
    created = (
        await auth_client.post(
            "/zoom-sessions/series", json=_series_body(zoom_cloud, start, repeat="weekly", until_days=14)
        )
    ).json()["created"]
    first, second, third = created

    # Ikkinchisidan boshlab bir soatga keyin va yuz nazoratisiz.
    new_start = datetime.fromisoformat(second["starts_at"]) + timedelta(hours=1)
    zoom_cloud["calls"].clear()
    response = await auth_client.put(
        f"/zoom-sessions/{second['id']}/following",
        json={
            "starts_at": new_start.isoformat(),
            "ends_at": (new_start + timedelta(minutes=80)).isoformat(),
            "group_ids": [zoom_cloud["group_id"]],
            **_teaching(zoom_cloud),
            "face_check_enabled": False,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["updated"] == 2
    assert [c[0] for c in zoom_cloud["calls"]].count("update") == 2

    async def _get(session_id: int) -> dict:
        return (await auth_client.get(f"/zoom-sessions/{session_id}")).json()

    assert (await _get(first["id"]))["starts_at"] == first["starts_at"]
    assert (await _get(first["id"]))["face_check_enabled"] is True
    for original in (second, third):
        moved = await _get(original["id"])
        assert datetime.fromisoformat(moved["starts_at"]) - datetime.fromisoformat(original["starts_at"]) == timedelta(hours=1)
        assert moved["face_check_enabled"] is False

    deleted = await auth_client.delete(f"/zoom-sessions/{second['id']}", params={"scope": "following"})
    assert deleted.status_code == 204, deleted.text
    remaining = (await async_db.execute(select(ZoomSession.id))).scalars().all()
    assert remaining == [first["id"]]


@pytest.mark.asyncio
async def test_update_following_skips_busy_week(auth_client, zoom_cloud):  # noqa: F811
    """Siljigan sana band vaqtga tushsa — o'sha sana `failed`, qolgani o'zgaradi va jarayon yiqilmaydi."""
    start = _first_start()
    created = (
        await auth_client.post(
            "/zoom-sessions/series", json=_series_body(zoom_cloud, start, repeat="weekly", until_days=14)
        )
    ).json()["created"]
    first, _, third = created

    shift = timedelta(hours=2)
    blocked = datetime.fromisoformat(third["starts_at"]) + shift
    busy = await auth_client.post(
        "/zoom-sessions/",
        json={
            "starts_at": blocked.isoformat(),
            "ends_at": (blocked + timedelta(minutes=80)).isoformat(),
            "group_ids": [zoom_cloud["other_group_id"]],
            **_teaching(zoom_cloud),
        },
    )
    assert busy.status_code == 201, busy.text

    new_start = datetime.fromisoformat(first["starts_at"]) + shift
    response = await auth_client.put(
        f"/zoom-sessions/{first['id']}/following",
        json={
            "starts_at": new_start.isoformat(),
            "ends_at": (new_start + timedelta(minutes=80)).isoformat(),
            "group_ids": [zoom_cloud["group_id"]],
            **_teaching(zoom_cloud),
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated"] == 2
    assert len(body["failed"]) == 1
    assert datetime.fromisoformat(body["failed"][0]["starts_at"]) == blocked
