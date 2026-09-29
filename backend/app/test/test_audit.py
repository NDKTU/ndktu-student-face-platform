"""Audit jurnali: kirish hodisalari, filtrlar va chegaralar.

Eng muhim talab — **audit asosiy ishni buzmasligi**. Yozib bo'lmasa,
foydalanuvchi baribir tizimga kira olishi kerak. Aks holda jurnal
qo'shilishi kirishni ishdan chiqarishi mumkin edi.
"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.audit import service as audit_service
from app.modules.audit.model import AuditEvent, AuditLog
from app.modules.audit.repository import purge_older_than


@pytest.mark.asyncio
async def test_successful_login_is_recorded(async_client, async_db, test_user):
    response = await async_client.post(
        "/user/login",
        json={"username": test_user["username"], "password": test_user["password"]},
        headers={"X-Forwarded-For": "10.0.0.7", "User-Agent": "AuditTest/1.0"},
    )
    assert response.status_code == 200, response.text

    log = (
        await async_db.execute(
            select(AuditLog).where(AuditLog.event == AuditEvent.LOGIN).order_by(AuditLog.id.desc())
        )
    ).scalars().first()
    assert log is not None
    assert log.username == test_user["username"]
    # IP proksi orqali keladi — `X-Forwarded-For` dagi birinchi manzil.
    assert log.ip == "10.0.0.7"
    assert log.user_agent == "AuditTest/1.0"


@pytest.mark.asyncio
async def test_failed_login_is_recorded(async_client, async_db, test_user):
    """Muvaffaqiyatsiz urinishsiz parol tanlash ko'rinmay qolardi."""
    response = await async_client.post(
        "/user/login",
        json={"username": test_user["username"], "password": "noto-g-ri-parol"},
    )
    assert response.status_code in (400, 401)

    log = (
        await async_db.execute(
            select(AuditLog)
            .where(AuditLog.event == AuditEvent.LOGIN_FAILED)
            .order_by(AuditLog.id.desc())
        )
    ).scalars().first()
    assert log is not None
    assert log.username == test_user["username"]
    # Hisob topilmasligi mumkin — shuning uchun `user_id` bo'sh bo'lishi
    # normal, lekin login har doim yoziladi.
    assert log.summary


@pytest.mark.asyncio
async def test_unknown_user_login_is_recorded(async_client, async_db, test_role):
    await async_client.post("/user/login", json={"username": "yo-q-odam", "password": "x"})

    log = (
        await async_db.execute(
            select(AuditLog).where(AuditLog.username == "yo-q-odam")
        )
    ).scalars().first()
    assert log is not None
    assert log.event == AuditEvent.LOGIN_FAILED
    assert log.user_id is None


@pytest.mark.asyncio
async def test_second_login_records_eviction(async_client, async_db, test_user):
    """Bitta faol sessiya: ikkinchi kirish birinchisini tugatadi."""
    creds = {"username": test_user["username"], "password": test_user["password"]}
    await async_client.post("/user/login", json=creds)
    await async_client.post("/user/login", json=creds)

    log = (
        await async_db.execute(
            select(AuditLog)
            .where(AuditLog.event == AuditEvent.SESSION_EVICTED)
            .order_by(AuditLog.id.desc())
        )
    ).scalars().first()
    assert log is not None
    # Login `user_id` bo'yicha to'ldiriladi: chaqiruvchida u yo'q edi.
    assert log.username == test_user["username"]


@pytest.mark.asyncio
async def test_logout_is_recorded(auth_client, async_db, test_user):
    response = await auth_client.post("/user/logout")
    assert response.status_code == 204

    log = (
        await async_db.execute(
            select(AuditLog).where(AuditLog.event == AuditEvent.LOGOUT)
        )
    ).scalars().first()
    assert log is not None
    assert log.user_id == test_user["id"]


@pytest.mark.asyncio
async def test_audit_failure_does_not_break_login(async_client, async_db, test_user, monkeypatch):
    """Jurnal yozilmasa ham kirish ishlashi shart.

    Aks holda audit qo'shilishi tizimga kirishni butunlay to'xtatib
    qo'yishi mumkin edi.
    """

    async def _boom(*args, **kwargs):
        raise RuntimeError("baza band")

    monkeypatch.setattr(audit_service.db_helper, "session_factory", _boom)

    response = await async_client.post(
        "/user/login",
        json={"username": test_user["username"], "password": test_user["password"]},
    )

    assert response.status_code == 200, response.text


# ─────────────────────────────── API ───────────────────────────────────


@pytest_asyncio.fixture
async def some_logs(async_db, test_user):
    rows = [
        AuditLog(event=AuditEvent.LOGIN, username="ali", user_id=test_user["id"], ip="10.0.0.1",
                 summary="Tizimga kirdi: ali"),
        AuditLog(event=AuditEvent.LOGIN_FAILED, username="vali", ip="10.0.0.2",
                 summary="Kirish muvaffaqiyatsiz: vali"),
        AuditLog(event=AuditEvent.QUESTION_DELETED, username="ali", user_id=test_user["id"],
                 object_type="question", object_id="42", summary="Savol o'chirildi"),
    ]
    async_db.add_all(rows)
    await async_db.commit()
    return rows


@pytest.mark.asyncio
async def test_list_requires_permission(async_client, test_role):
    async_client.headers.pop("Authorization", None)
    response = await async_client.get("/audit/")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_returns_newest_first(auth_client, some_logs):
    response = await auth_client.get("/audit/", params={"limit": 50})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= 3

    # Tartib — `created_at`, keyin `id`. Faqat `id` bo'yicha tekshirib
    # bo'lmaydi: Postgres'da `now()` tranzaksiya boshlanish vaqtini
    # qaytaradi, ya'ni bitta tranzaksiyada yozilgan qatorlarda vaqt bir xil,
    # boshqa tranzaksiyadagi eskiroq `id` esa kechroq vaqtga ega bo'lishi
    # mumkin.
    keys = [(row["created_at"], row["id"]) for row in body["logs"]]
    assert keys == sorted(keys, reverse=True)


@pytest.mark.asyncio
async def test_filter_by_event(auth_client, some_logs):
    response = await auth_client.get("/audit/", params={"event": AuditEvent.LOGIN_FAILED})

    assert response.status_code == 200
    events = {row["event"] for row in response.json()["logs"]}
    assert events == {AuditEvent.LOGIN_FAILED}


@pytest.mark.asyncio
async def test_only_auth_filter_hides_actions(auth_client, some_logs):
    response = await auth_client.get("/audit/", params={"only_auth": True, "limit": 50})

    events = {row["event"] for row in response.json()["logs"]}
    assert AuditEvent.QUESTION_DELETED not in events
    assert AuditEvent.LOGIN in events


@pytest.mark.asyncio
async def test_search_matches_username_and_ip(auth_client, some_logs):
    by_name = await auth_client.get("/audit/", params={"search": "vali"})
    assert [r["username"] for r in by_name.json()["logs"]] == ["vali"]

    by_ip = await auth_client.get("/audit/", params={"search": "10.0.0.2"})
    assert [r["ip"] for r in by_ip.json()["logs"]] == ["10.0.0.2"]


@pytest.mark.asyncio
async def test_date_to_includes_the_whole_day(auth_client, async_db, test_user):
    """`date_to` — o'sha kunning oxirigacha.

    Oddiy `<= sana` bo'lsa, o'sha kunning yozuvlari tushib qolardi:
    ularning vaqti 00:00 dan katta.
    """
    async_db.add(AuditLog(event=AuditEvent.LOGIN, username="bugun", summary="x"))
    await async_db.commit()
    today = datetime.now().date().isoformat()

    response = await auth_client.get("/audit/", params={"date_from": today, "date_to": today})

    assert response.status_code == 200
    assert any(r["username"] == "bugun" for r in response.json()["logs"])


@pytest.mark.asyncio
async def test_events_endpoint_counts(auth_client, some_logs):
    response = await auth_client.get("/audit/events")

    assert response.status_code == 200
    counts = {e["value"]: e["count"] for e in response.json()}
    assert counts.get(AuditEvent.QUESTION_DELETED) == 1


# ──────────────────────────── Saqlash muddati ──────────────────────────


@pytest.mark.asyncio
async def test_purge_removes_only_old_rows(async_db):
    old = AuditLog(event=AuditEvent.LOGIN, username="eski", summary="x")
    fresh = AuditLog(event=AuditEvent.LOGIN, username="yangi", summary="x")
    async_db.add_all([old, fresh])
    await async_db.commit()

    # `created_at` server tomonida qo'yiladi — eskisini qo'lda surib qo'yamiz.
    from sqlalchemy import update

    await async_db.execute(
        update(AuditLog)
        .where(AuditLog.id == old.id)
        .values(created_at=datetime.now() - timedelta(days=200))
    )
    await async_db.commit()

    removed = await purge_older_than(async_db, days=90)

    assert removed == 1
    left = (await async_db.execute(select(AuditLog.username))).scalars().all()
    assert "eski" not in left
    assert "yangi" in left


@pytest.mark.asyncio
async def test_overlong_values_are_clipped_not_dropped(async_client, async_db, test_role):
    """Uzun login yoki sarlavha yozuvni yo'qotmasligi kerak.

    Ustunlar chegaralangan (`username` 150, `user_agent` 500). Qiymat
    sig'masa `INSERT` yiqilardi, xato esa yutiladi — ya'ni uzun login
    yuborib jurnalga tushmaslik mumkin bo'lardi. Bu parol tanlayotgan
    odam uchun tayyor yo'l edi.
    """
    long_login = "u" * 400
    await async_client.post(
        "/user/login",
        json={"username": long_login, "password": "x"},
        headers={"User-Agent": "A" * 900},
    )

    log = (
        await async_db.execute(
            select(AuditLog).where(AuditLog.event == AuditEvent.LOGIN_FAILED).order_by(AuditLog.id.desc())
        )
    ).scalars().first()

    assert log is not None, "uzun qiymat yozuvni yo'qotmasligi kerak"
    assert len(log.username) == 150
    assert len(log.user_agent) == 500
