"""Yuz ko'rinmasa testni yakunlash (`core/utils/proctoring.py`).

* sozlamani faqat `manage:proctoring_auto_finish` ruxsatli rol (yoki admin)
  yoqadi, o'zgartiradi va o'chiradi; maydonni yubormagan tahrir uni saqlaydi;
* kamerasiz rejimda sozlama o'chadi;
* sozlama test sahifasiga yetadi, `no_face` qoidabuzarligi urinishni yopadi,
  sozlama o'chiq bo'lsa — rad etiladi.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.utils.proctoring import resolve_no_face_finish, validate_no_face_seconds
from app.test.test_general_test_access import scene  # noqa: F401 — fixture
from app.test.test_general_test_proctoring import _prepare
from app.test.test_student_dashboard import _login


def _user(*role_names: str):
    return SimpleNamespace(roles=[SimpleNamespace(id=10_000 + i, name=n) for i, n in enumerate(role_names)])


def test_seconds_bounds():
    assert validate_no_face_seconds(None) is None
    assert validate_no_face_seconds(0) == 0
    assert validate_no_face_seconds(60) == 60
    for wrong in (5, 601):
        with pytest.raises(ValueError):
            validate_no_face_seconds(wrong)


@pytest.mark.asyncio
async def test_only_permitted_role_changes_it(async_db):
    teacher = _user("teacher")
    # Kamerasiz rejim — sozlama ma'nosiz, ruxsat so'ralmaydi.
    assert await resolve_no_face_finish(async_db, teacher, current=60, requested=30, proctoring_mode="standard") is None
    # Yubormagan yoki o'sha qiymat — o'zgarish yo'q, ruxsat kerak emas.
    assert await resolve_no_face_finish(async_db, teacher, current=60, requested=None, proctoring_mode="face") == 60
    assert await resolve_no_face_finish(async_db, teacher, current=60, requested=60, proctoring_mode="face") == 60
    for requested in (30, 0):  # yoqish/o'zgartirish ham, o'chirish ham
        with pytest.raises(HTTPException) as denied:
            await resolve_no_face_finish(async_db, teacher, current=60, requested=requested, proctoring_mode="face")
        assert denied.value.status_code == 403
        assert denied.value.detail["code"] == "proctoring_auto_finish_forbidden"
    assert await resolve_no_face_finish(async_db, _user("Admin"), current=None, requested=45, proctoring_mode="face") == 45


@pytest.mark.asyncio
async def test_quiz_setting_survives_update_and_turns_off(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    payload = {
        "title": "Yuz nazorati",
        "question_number": 5,
        "duration": 30,
        "pin": "9999",
        "user_id": users_resp.json()["users"][0]["id"],
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "proctoring_mode": "face",
        "no_face_finish_seconds": 60,
    }
    created = await auth_client.post("/quiz/", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["no_face_finish_seconds"] == 60
    quiz_id = created.json()["id"]

    payload.pop("no_face_finish_seconds")
    kept = await auth_client.put(f"/quiz/{quiz_id}", json=payload)
    assert kept.json()["no_face_finish_seconds"] == 60

    off = await auth_client.put(f"/quiz/{quiz_id}", json={**payload, "no_face_finish_seconds": 0})
    assert off.json()["no_face_finish_seconds"] is None

    invalid = await auth_client.put(f"/quiz/{quiz_id}", json={**payload, "no_face_finish_seconds": 3})
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_general_test_no_face_closes_attempt(auth_client, async_client, async_db, scene):  # noqa: F811
    await _prepare(auth_client, async_db, scene, "face")
    set_on = await auth_client.put(f"/general-test/{scene['test_id']}", json={"no_face_finish_seconds": 30})
    assert set_on.json()["no_face_finish_seconds"] == 30

    headers = await _login(async_client, "gt_staff")
    state = (await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)).json()
    assert state["no_face_finish_seconds"] == 30

    closed = await async_client.post(
        f"/general-test/attempt/{state['attempt_id']}/cheating", json={"kind": "no_face"}, headers=headers
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["stop_reason"] == "Kadrda yuz ko'rinmadi"


@pytest.mark.asyncio
async def test_no_face_report_rejected_when_setting_off(auth_client, async_client, async_db, scene):  # noqa: F811
    await _prepare(auth_client, async_db, scene, "face")
    headers = await _login(async_client, "gt_staff")
    state = (await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)).json()
    assert state["no_face_finish_seconds"] is None

    rejected = await async_client.post(
        f"/general-test/attempt/{state['attempt_id']}/cheating", json={"kind": "no_face"}, headers=headers
    )
    assert rejected.status_code == 400
