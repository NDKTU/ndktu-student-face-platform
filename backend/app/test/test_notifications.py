"""Bildirishnomalar: o'z xabarlari va o'qilgan deb belgilash.

Asosiy chegara — foydalanuvchi faqat o'z bildirishnomalarini ko'radi va
faqat o'zinikini o'qilgan deb belgilay oladi. Ikkinchisi zararsiz
ko'rinadi, lekin u holda kimningdir qo'ng'iroqchasi jimgina tozalanardi.
"""

from datetime import date

import pytest
import pytest_asyncio

from app.modules.notification.model import Notification, NotificationType


async def _make_user(async_db, username: str):
    from app.modules.auth.model import Role, User

    role = Role(name=f"Role-{username}")
    user = User(username=username, password="not-used", roles=[role])
    async_db.add_all([role, user])
    await async_db.flush()
    return user


def _notification(user_id: int, title: str, *, is_read: bool = False) -> Notification:
    return Notification(
        user_id=user_id,
        type=NotificationType.REQUEST_STATUS,
        title=title,
        body="Matn",
        payload={"tracking_no": "REQ-2026-0001"},
        is_read=is_read,
    )


@pytest_asyncio.fixture
async def two_users_with_notifications(async_client, async_db, test_role):
    mine = await _make_user(async_db, "notif_owner")
    other = await _make_user(async_db, "notif_stranger")

    async_db.add_all(
        [
            _notification(mine.id, "Mening birinchisi"),
            _notification(mine.id, "Mening ikkinchisi"),
            _notification(mine.id, "O'qilgan", is_read=True),
            _notification(other.id, "Begona xabar"),
        ]
    )
    await async_db.commit()

    # Token o'z egasining nomidan olinadi: ro'yxat aynan shu bo'yicha
    # cheklanishini tekshiramiz.
    from app.modules.auth.user.service import auth_service

    token = await auth_service.create_session_token(mine.id)
    async_client.headers.update({"Authorization": f"Bearer {token}"})
    return {"client": async_client, "user_id": mine.id, "other_id": other.id}


@pytest.mark.asyncio
async def test_list_returns_only_own_notifications(two_users_with_notifications):
    client = two_users_with_notifications["client"]

    response = await client.get("/notification/")

    assert response.status_code == 200, response.json()
    body = response.json()
    titles = [n["title"] for n in body["notifications"]]
    assert "Begona xabar" not in titles
    assert body["total"] == 3
    # O'qilmaganlar soni ro'yxat bilan birga keladi — qo'ng'iroqcha uchun
    # alohida so'rov shart emas.
    assert body["unread"] == 2


@pytest.mark.asyncio
async def test_unread_filter(two_users_with_notifications):
    client = two_users_with_notifications["client"]

    response = await client.get("/notification/", params={"only_unread": True})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert all(not n["is_read"] for n in body["notifications"])


@pytest.mark.asyncio
async def test_unread_count_endpoint(two_users_with_notifications):
    client = two_users_with_notifications["client"]

    response = await client.get("/notification/unread-count")

    assert response.status_code == 200
    assert response.json()["unread"] == 2


@pytest.mark.asyncio
async def test_mark_read_reduces_the_count(two_users_with_notifications):
    client = two_users_with_notifications["client"]
    listing = await client.get("/notification/", params={"only_unread": True})
    target = listing.json()["notifications"][0]["id"]

    marked = await client.post(f"/notification/{target}/read")
    assert marked.status_code == 200
    assert marked.json()["updated"] == 1

    assert (await client.get("/notification/unread-count")).json()["unread"] == 1

    # Ikkinchi marta — o'zgarish yo'q.
    again = await client.post(f"/notification/{target}/read")
    assert again.status_code == 404


@pytest.mark.asyncio
async def test_cannot_mark_someone_elses_notification(two_users_with_notifications, async_db):
    from sqlalchemy import select

    client = two_users_with_notifications["client"]
    stranger_id = (
        await async_db.execute(
            select(Notification.id).where(
                Notification.user_id == two_users_with_notifications["other_id"]
            )
        )
    ).scalar_one()

    response = await client.post(f"/notification/{stranger_id}/read")

    # 404, 403 emas: boshqa odamning bildirishnomasi borligini oshkor
    # qilmaymiz.
    assert response.status_code == 404
    still_unread = (
        await async_db.execute(
            select(Notification.is_read).where(Notification.id == stranger_id)
        )
    ).scalar_one()
    assert still_unread is False


@pytest.mark.asyncio
async def test_read_all(two_users_with_notifications, async_db):
    from sqlalchemy import select

    client = two_users_with_notifications["client"]

    response = await client.post("/notification/read-all")

    assert response.status_code == 200
    assert response.json()["updated"] == 2
    assert (await client.get("/notification/unread-count")).json()["unread"] == 0

    # Begona xabar tegilmagan bo'lishi kerak.
    stranger_unread = (
        await async_db.execute(
            select(Notification.is_read).where(
                Notification.user_id == two_users_with_notifications["other_id"]
            )
        )
    ).scalar_one()
    assert stranger_unread is False


@pytest.mark.asyncio
async def test_anonymous_cannot_read_notifications(async_client):
    async_client.headers.pop("Authorization", None)

    response = await async_client.get("/notification/")

    assert response.status_code in (401, 403)
