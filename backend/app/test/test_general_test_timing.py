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

