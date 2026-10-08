"""Elementar test: qat'iy rejim — xuddi `test_quiz_strict_mode.py` dagi qoidalar.

Farqi: test sahifasi urinishni `GET /attempt/{id}` dan oladi, shuning uchun
sahifani yangilash shu yo'l orqali ushlanadi.
"""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.redis_client import redis_client
from app.modules.general_test.model import GeneralTestAttempt
from app.modules.general_test.repository import STRICT_KIND
from app.modules.quiz.quiz_process.strict import _key
from app.test.test_general_test_access import scene  # noqa: F401 — fixture
from app.test.test_general_test_timing import _start_as_staff


async def _strict_start(auth_client, async_client, scene):  # noqa: F811
    switched = await auth_client.put(f"/general-test/{scene['test_id']}", json={"strict_mode": True})
    assert switched.status_code == 200, switched.text
    assert switched.json()["strict_mode"] is True
    headers, state = await _start_as_staff(auth_client, async_client, scene)
    assert state["strict_mode"] is True
    return headers, state


async def _attempt(async_db, attempt_id: int) -> GeneralTestAttempt:
    async_db.expire_all()
    return (
        await async_db.execute(select(GeneralTestAttempt).where(GeneralTestAttempt.id == attempt_id))
    ).scalar_one()


async def _age(async_db, attempt_id: int) -> None:
    """Urinishni «qaytish oynasi» dan tashqariga suradi."""
    attempt = await _attempt(async_db, attempt_id)
    attempt.started_at = attempt.started_at - timedelta(minutes=1)
    await async_db.commit()


@pytest.mark.asyncio
async def test_leave_closes_attempt(auth_client, async_client, async_db, scene):  # noqa: F811
    headers, state = await _strict_start(auth_client, async_client, scene)
    attempt_id = state["attempt_id"]

    left = await async_client.post(f"/general-test/attempt/{attempt_id}/leave", json={"reason": "split"}, headers=headers)
    assert left.status_code == 200, left.text
    assert left.json()["stop_reason"] == "Ekranni bo'ldi"

    attempt = await _attempt(async_db, attempt_id)
    assert attempt.status == "completed"
    assert attempt.stop_reason == "Ekranni bo'ldi"

    question = state["questions"][0]["id"]
    answer = await async_client.post(
        f"/general-test/attempt/{attempt_id}/answer", json={"question_id": question, "option": "a"}, headers=headers
    )
    assert answer.status_code == 409

    results = await auth_client.get("/general-test/results")
    assert results.json()["results"][0]["stop_reason"] == "Ekranni bo'ldi"


@pytest.mark.asyncio
async def test_first_page_open_is_allowed_second_closes(auth_client, async_client, async_db, scene):  # noqa: F811
    headers, state = await _strict_start(auth_client, async_client, scene)
    attempt_id = state["attempt_id"]

    first = await async_client.get(f"/general-test/attempt/{attempt_id}", headers=headers)
    assert first.status_code == 200, first.text

    await _age(async_db, attempt_id)
    reopened = await async_client.get(f"/general-test/attempt/{attempt_id}", headers=headers)

    assert reopened.status_code == 409
    assert reopened.json()["detail"]["code"] == "attempt_closed_left_page"
    assert (await _attempt(async_db, attempt_id)).stop_reason == "Sahifani qayta ochdi"


@pytest.mark.asyncio
async def test_start_again_after_window_closes(auth_client, async_client, async_db, scene):  # noqa: F811
    headers, state = await _strict_start(auth_client, async_client, scene)
    await _age(async_db, state["attempt_id"])

    again = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)

    assert again.status_code == 409
    assert (await _attempt(async_db, state["attempt_id"])).status == "completed"


@pytest.mark.asyncio
async def test_missing_heartbeat_closes_on_answer(auth_client, async_client, async_db, scene):  # noqa: F811
    headers, state = await _strict_start(auth_client, async_client, scene)
    attempt_id = state["attempt_id"]
    await redis_client.delete(_key(attempt_id, STRICT_KIND))

    answer = await async_client.post(
        f"/general-test/attempt/{attempt_id}/answer",
        json={"question_id": state["questions"][0]["id"], "option": "a"},
        headers=headers,
    )

    assert answer.status_code == 409
    assert answer.json()["detail"]["code"] == "attempt_closed_left_page"
    assert (await _attempt(async_db, attempt_id)).stop_reason == "Aloqa uzildi"


@pytest.mark.asyncio
async def test_heartbeat_keeps_attempt_alive(auth_client, async_client, scene):  # noqa: F811
    headers, state = await _strict_start(auth_client, async_client, scene)
    attempt_id = state["attempt_id"]

    alive = await async_client.post(f"/general-test/attempt/{attempt_id}/heartbeat", headers=headers)
    assert alive.status_code == 200, alive.text

    await redis_client.delete(_key(attempt_id, STRICT_KIND))
    late = await async_client.post(f"/general-test/attempt/{attempt_id}/heartbeat", headers=headers)
    assert late.status_code == 409


@pytest.mark.asyncio
async def test_regular_test_is_unaffected(auth_client, async_client, async_db, scene):  # noqa: F811
    headers, state = await _start_as_staff(auth_client, async_client, scene)
    attempt_id = state["attempt_id"]
    assert state["strict_mode"] is False

    left = await async_client.post(f"/general-test/attempt/{attempt_id}/leave", json={}, headers=headers)
    assert left.status_code == 400

    await _age(async_db, attempt_id)
    for _ in range(2):
        reopened = await async_client.get(f"/general-test/attempt/{attempt_id}", headers=headers)
        assert reopened.status_code == 200, reopened.text


@pytest.mark.asyncio
async def test_update_without_flag_keeps_it(auth_client, scene):  # noqa: F811
    await auth_client.put(f"/general-test/{scene['test_id']}", json={"strict_mode": True})

    updated = await auth_client.put(f"/general-test/{scene['test_id']}", json={"duration": 45})
    assert updated.json()["strict_mode"] is True

    cleared = await auth_client.put(f"/general-test/{scene['test_id']}", json={"strict_mode": None})
    assert cleared.status_code == 200
    assert cleared.json()["strict_mode"] is True


@pytest.mark.asyncio
async def test_hold_to_reveal_reaches_attempt(auth_client, async_client, scene):  # noqa: F811
    switched = await auth_client.put(f"/general-test/{scene['test_id']}", json={"hold_to_reveal": True})
    assert switched.json()["hold_to_reveal"] is True
    kept = await auth_client.put(f"/general-test/{scene['test_id']}", json={"duration": 40})
    assert kept.json()["hold_to_reveal"] is True

    _, state = await _start_as_staff(auth_client, async_client, scene)
    assert state["hold_to_reveal"] is True
