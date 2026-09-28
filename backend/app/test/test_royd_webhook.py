"""ROYD webhook'i: imzo, takrorlar va bildirishnoma.

Shakl ROYD hujjatidan olingan (`docs/INTEGRATION.md` §4):

* imzo — tananing XOM baytlari bo'yicha HMAC-SHA256, vaqt imzoga KIRMAYDI;
* `X-ROYD-Delivery` — yetkazish identifikatori; bir hodisa ikki marta
  kelishi mumkin, chunki ROYD 2xx olmaguncha 8 marta urinadi;
* to'rt hodisa: `created`, `status_changed`, `message_created`, `file_added`.

Imzo bu yo'ldagi yagona himoya (token yo'q), shuning uchun har bir sharti
alohida qayd etilgan: usiz murojaat holatini istalgan kishi soxtalashtirardi.
"""

import hashlib
import hmac
import json
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.config import settings
from app.modules.notification.model import Notification

SECRET = "webhook-secret-at-least-32-characters-long"
HEMIS_ID = "3052211100123"


def _envelope(event: str = "request.status_changed", **data_overrides) -> bytes:
    data = {
        "request_id": 42,
        "tracking_no": "REQ-2026-00042",
        "client_ref": "7f1c2e9a",
        "student_hemis_id": HEMIS_ID,
        "status": "returned",
        "status_label": "Qaytarildi",
        "sla_deadline": None,
        "old_status": "accepted",
        "comment": "Pasport nusxasini yuklang",
    }
    data.update(data_overrides)
    body = {
        "id": "3f9a0c1b2d4e5f6a7b8c9d0e",
        "event": event,
        "occurred_at": "2026-09-28T09:15:00+00:00",
        "data": data,
    }
    return json.dumps(body, ensure_ascii=False).encode()


def _headers(body: bytes, *, secret: str = SECRET, delivery: str | None = None) -> dict[str, str]:
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    envelope = json.loads(body)
    return {
        "X-ROYD-Event": envelope["event"],
        "X-ROYD-Delivery": delivery or envelope["id"],
        "X-ROYD-Signature": signature,
        "Content-Type": "application/json",
    }


@pytest_asyncio.fixture(autouse=True)
def _configure(monkeypatch):
    monkeypatch.setattr(settings.royd, "webhook_secret", SECRET)


@pytest_asyncio.fixture(autouse=True)
async def _clear_delivery_keys():
    """Takrorlar Redis'da belgilanadi — testlar orasida tozalanadi."""
    from app.core.redis_client import redis_client

    yield
    keys = await redis_client.keys("royd:delivery:*")
    if keys:
        await redis_client.delete(*keys)


@pytest_asyncio.fixture
async def student(async_db, test_faculty, make_group):
    from app.modules.auth.model import Role, Student, User

    group = await make_group("ROYD-101", test_faculty["id"])
    role = Role(name="StudentRoyd")
    user = User(username="royd_student", password="not-used", roles=[role])
    async_db.add_all([role, user])
    await async_db.flush()
    async_db.add(
        Student(
            user_id=user.id,
            group_id=group["id"],
            first_name="Royd",
            last_name="Talaba",
            third_name="Test",
            full_name="Talaba Royd Test",
            student_id_number=HEMIS_ID,
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
    return user.id


@pytest.mark.asyncio
async def test_status_change_creates_notification(async_client, async_db, student):
    body = _envelope()

    response = await async_client.post(
        "/integration/royd/webhook", content=body, headers=_headers(body)
    )

    assert response.status_code == 202, response.text
    assert response.json() == {"accepted": True}

    notification = (
        await async_db.execute(select(Notification).where(Notification.user_id == student))
    ).scalar_one()
    # Holat nomini ROYD o'zi o'zbekcha beradi — biz uni takrorlamaymiz.
    assert "Qaytarildi" in notification.title
    assert "REQ-2026-00042" in notification.title
    assert notification.body == "Pasport nusxasini yuklang"
    assert notification.payload["event"] == "request.status_changed"
    assert notification.is_read is False


@pytest.mark.asyncio
async def test_duplicate_delivery_is_ignored(async_client, async_db, student):
    """Bir hodisa ikki marta kelsa — bitta bildirishnoma."""
    body = _envelope()
    headers = _headers(body)

    first = await async_client.post("/integration/royd/webhook", content=body, headers=headers)
    second = await async_client.post("/integration/royd/webhook", content=body, headers=headers)

    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json().get("duplicate") is True

    rows = (await async_db.execute(select(Notification))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_message_event_names_the_sender(async_client, async_db, student):
    body = _envelope(
        "request.message_created",
        message={
            "id": 5,
            "content": "Hujjat tayyor",
            "sender_name": "Karimov A.",
            "sender_role": "registrator",
            "from_student": False,
        },
    )

    response = await async_client.post(
        "/integration/royd/webhook", content=body, headers=_headers(body)
    )

    assert response.status_code == 202
    notification = (await async_db.execute(select(Notification))).scalar_one()
    assert "yangi xabar" in notification.title
    assert "Karimov A." in notification.body
    assert "Hujjat tayyor" in notification.body


@pytest.mark.asyncio
async def test_own_creation_makes_no_notification(async_client, async_db, student):
    """`request.created` — talabaning o'z harakati, xabar bermaymiz."""
    body = _envelope("request.created")

    response = await async_client.post(
        "/integration/royd/webhook", content=body, headers=_headers(body)
    )

    assert response.status_code == 202
    assert response.json().get("skipped") == "own_action"
    assert (await async_db.execute(select(Notification))).first() is None


@pytest.mark.asyncio
async def test_unsigned_request_is_rejected(async_client, async_db, student):
    body = _envelope()

    response = await async_client.post(
        "/integration/royd/webhook", content=body, headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 400
    assert (await async_db.execute(select(Notification))).first() is None


@pytest.mark.asyncio
async def test_wrong_secret_is_rejected(async_client, async_db, student):
    body = _envelope()

    response = await async_client.post(
        "/integration/royd/webhook", content=body, headers=_headers(body, secret="boshqa-sir")
    )

    assert response.status_code == 401
    assert (await async_db.execute(select(Notification))).first() is None


@pytest.mark.asyncio
async def test_tampered_body_is_rejected(async_client, async_db, student):
    """Imzo olingandan keyin tana o'zgartirilsa — rad etiladi."""
    headers = _headers(_envelope())
    tampered = _envelope(status="completed", status_label="Bajarildi")

    response = await async_client.post(
        "/integration/royd/webhook", content=tampered, headers=headers
    )

    assert response.status_code == 401
    assert (await async_db.execute(select(Notification))).first() is None


@pytest.mark.asyncio
async def test_unknown_student_is_accepted_but_skipped(async_client, async_db, student):
    """Bizda yo'q talaba — xato emas, aks holda ROYD 8 marta qayta yuborardi."""
    body = _envelope(student_hemis_id="BEGONA-999")

    response = await async_client.post(
        "/integration/royd/webhook", content=body, headers=_headers(body)
    )

    assert response.status_code == 202
    assert response.json()["accepted"] is False
    assert (await async_db.execute(select(Notification))).first() is None


@pytest.mark.asyncio
async def test_webhook_is_closed_without_secret(async_client, monkeypatch, student):
    monkeypatch.setattr(settings.royd, "webhook_secret", "")
    body = _envelope()

    response = await async_client.post(
        "/integration/royd/webhook", content=body, headers=_headers(body)
    )

    assert response.status_code == 503
