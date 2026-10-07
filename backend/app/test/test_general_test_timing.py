"""Elementar test: urinish vaqti.

* muddat urinish boshlanganda qotiriladi — testning davomiyligini imtihon
  paytida o'zgartirish ketayotgan urinishlarga ta'sir qilmaydi;
* vaqti o'tgan urinish o'qituvchi natijalarni ochganda ham yopiladi — talaba
  brauzerni yopib ketsa ham natijalarda chiqadi;
* boshlangan urinishga test o'chirilgandan keyin ham qaytish mumkin.
"""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.modules.general_test.model import GeneralTestAttempt
from app.test.test_general_test_access import scene  # noqa: F401 — fixture
from app.test.test_student_dashboard import _login


async def _start_as_staff(auth_client, async_client, scene):  # noqa: F811
    added = await auth_client.post(
        f"/general-test/subject/{scene['subject_id']}/users", json={"user_ids": [scene["staff"].id]}
    )
    assert added.status_code == 200, added.text
    headers = await _login(async_client, "gt_staff")
    started = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)
    assert started.status_code == 200, started.text
    return headers, started.json()


async def _attempt(async_db, attempt_id: int) -> GeneralTestAttempt:
    async_db.expire_all()
    return (
        await async_db.execute(select(GeneralTestAttempt).where(GeneralTestAttempt.id == attempt_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_duration_is_frozen_at_start(auth_client, async_client, async_db, scene):  # noqa: F811
    headers, state = await _start_as_staff(auth_client, async_client, scene)
    attempt = await _attempt(async_db, state["attempt_id"])
    assert attempt.duration == 30

    # Test 30 → 1 daqiqa, urinish boshlanganiga 10 daqiqa bo'ldi.
    assert (await auth_client.put(f"/general-test/{scene['test_id']}", json={"duration": 1})).status_code == 200
    attempt.started_at = attempt.started_at - timedelta(minutes=10)
    await async_db.commit()

    current = await async_client.get(f"/general-test/attempt/{state['attempt_id']}", headers=headers)
    assert current.status_code == 200, current.text
    assert 19 * 60 <= current.json()["remaining_seconds"] <= 20 * 60


@pytest.mark.asyncio
async def test_expired_attempt_is_closed_when_results_are_opened(
    auth_client, async_client, async_db, scene  # noqa: F811
):
    _, state = await _start_as_staff(auth_client, async_client, scene)
    attempt = await _attempt(async_db, state["attempt_id"])
    attempt.started_at = attempt.started_at - timedelta(minutes=45)
    await async_db.commit()

    results = await auth_client.get("/general-test/results")
    assert results.status_code == 200, results.text
    assert [r["attempt_id"] for r in results.json()["results"]] == [state["attempt_id"]]

    closed = await _attempt(async_db, state["attempt_id"])
    assert closed.status == "completed"
    # Yakunlangan vaqt — muddat, so'rov paytidagi soat emas.
    assert closed.finished_at == closed.started_at + timedelta(minutes=30)


@pytest.mark.asyncio
async def test_started_attempt_survives_deactivation(auth_client, async_client, scene):  # noqa: F811
    headers, state = await _start_as_staff(auth_client, async_client, scene)
    assert (await auth_client.put(f"/general-test/{scene['test_id']}", json={"is_active": False})).status_code == 200

    available = await async_client.get("/general-test/available", headers=headers)
    assert available.status_code == 200, available.text
    tests = available.json()["tests"]
    assert [t["id"] for t in tests] == [scene["test_id"]]
    assert tests[0]["in_progress_attempt_id"] == state["attempt_id"]

    resumed = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["attempt_id"] == state["attempt_id"]

    # Yangi urinish esa o'chirilgan testda boshlanmaydi.
    finished = await async_client.post(f"/general-test/attempt/{state['attempt_id']}/finish", headers=headers)
    assert finished.status_code == 200, finished.text
    again = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)
    assert again.status_code == 400, again.text
    assert (await async_client.get("/general-test/available", headers=headers)).json()["tests"] == []


@pytest.mark.asyncio
async def test_optional_pin(auth_client, async_client, scene):  # noqa: F811
    """PIN ixtiyoriy: yoqilsa server yaratadi, yangi urinish uni so'raydi,
    boshlangan urinishga qaytish — yo'q. Talaba PIN'ning o'zini ko'rmaydi."""
    test_url = f"/general-test/{scene['test_id']}"
    on = await auth_client.put(test_url, json={"pin_required": True})
    assert on.status_code == 200, on.text
    pin = on.json()["pin"]
    assert pin and len(pin) == 4 and pin.isdigit()

    # Qayta yoqish PIN'ni almashtirmaydi; `regenerate_pin` — almashtiradi.
    assert (await auth_client.put(test_url, json={"pin_required": True})).json()["pin"] == pin

    added = await auth_client.post(
        f"/general-test/subject/{scene['subject_id']}/users", json={"user_ids": [scene["staff"].id]}
    )
    assert added.status_code == 200, added.text
    headers = await _login(async_client, "gt_staff")

    available = (await async_client.get("/general-test/available", headers=headers)).json()["tests"]
    assert available[0]["pin_required"] is True
    assert "pin" not in available[0]

    start_url = f"/general-test/{scene['test_id']}/start"
    assert (await async_client.post(start_url, headers=headers)).status_code == 403
    wrong = "0000" if pin != "0000" else "1111"
    assert (await async_client.post(start_url, json={"pin": wrong}, headers=headers)).status_code == 403
    started = await async_client.post(start_url, json={"pin": pin}, headers=headers)
    assert started.status_code == 200, started.text

    # Qaytish PIN'siz.
    resumed = await async_client.post(start_url, headers=headers)
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["attempt_id"] == started.json()["attempt_id"]

    regenerated = await auth_client.put(test_url, json={"regenerate_pin": True})
    assert regenerated.json()["pin"] not in (None,)

    off = await auth_client.put(test_url, json={"pin_required": False})
    assert off.json()["pin"] is None
    # PIN'siz testda `regenerate_pin` PIN yoqmaydi.
    assert (await auth_client.put(test_url, json={"regenerate_pin": True})).json()["pin"] is None


@pytest.mark.asyncio
async def test_created_with_pin(auth_client):
    subject = await auth_client.post("/general-test/subject", json={"name": "PIN fani"})
    assert subject.status_code == 201, subject.text
    created = await auth_client.post(
        "/general-test/", json={"subject_id": subject.json()["id"], "pin_required": True}
    )
    assert created.status_code == 201, created.text
    assert len(created.json()["pin"]) == 4
    plain = await auth_client.post("/general-test/", json={"subject_id": subject.json()["id"]})
    assert plain.json()["pin"] is None
