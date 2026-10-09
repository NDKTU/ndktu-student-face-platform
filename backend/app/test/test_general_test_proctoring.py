"""Elementar test: yuz nazorati — oddiy testdagi uchta rejim.

* `face_entry` — kirishda yuz tasdig'i serverda; tasdiqsiz `start` ham,
  test sahifasi ham ochilmaydi;
* `face` — test sahifasi yuz xizmati tokenini oladi, qoidabuzarlik
  urinishni sabab bilan yopadi;
* suratsiz foydalanuvchi kamerali testga qo'yilmaydi (admin bundan mustasno).
"""

import pytest
from sqlalchemy import select

from app.core.redis_client import redis_client
from app.modules.general_test import repository as gt_repository
from app.modules.general_test.model import GeneralTestAttempt
from app.test.test_general_test_access import scene  # noqa: F401 — fixture
from app.test.test_student_dashboard import _login

PHOTO = "https://example.test/uploads/profile/staff.jpg"


async def _prepare(auth_client, async_db, scene, mode: str, *, photo: bool = True):  # noqa: F811
    switched = await auth_client.put(f"/general-test/{scene['test_id']}", json={"proctoring_mode": mode})
    assert switched.status_code == 200, switched.text
    assert switched.json()["proctoring_mode"] == mode
    added = await auth_client.post(
        f"/general-test/subject/{scene['subject_id']}/users", json={"user_ids": [scene["staff"].id]}
    )
    assert added.status_code == 200, added.text
    if photo:
        scene["staff"].avatar_path = PHOTO
        await async_db.commit()


def _fake_face(monkeypatch, *, match: bool):
    calls = []

    async def fake_verify(image_base64: str, reference_url: str) -> dict:
        calls.append(reference_url)
        return {"face_count": 1, "is_match": match, "reference_ready": True}

    monkeypatch.setattr(gt_repository, "verify_face", fake_verify)
    return calls


@pytest.mark.asyncio
async def test_camera_test_needs_a_reference_photo(auth_client, async_client, async_db, scene):  # noqa: F811
    await _prepare(auth_client, async_db, scene, "face", photo=False)
    headers = await _login(async_client, "gt_staff")

    started = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)

    assert started.status_code == 400
    assert started.json()["detail"]["code"] == "student_photo_missing"


@pytest.mark.asyncio
async def test_face_entry_requires_server_side_verification(
    auth_client, async_client, async_db, scene, monkeypatch  # noqa: F811
):
    await _prepare(auth_client, async_db, scene, "face_entry")
    headers = await _login(async_client, "gt_staff")
    start_url = f"/general-test/{scene['test_id']}/start"

    blocked = await async_client.post(start_url, headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "face_verification_required"

    _fake_face(monkeypatch, match=False)
    rejected = await async_client.post(
        f"/general-test/{scene['test_id']}/verify_entry_face", json={"image_base64": "AAAA"}, headers=headers
    )
    assert rejected.json() == {
        "verified": False,
        "status": "different_person",
        "message": rejected.json()["message"],
    }
    assert (await async_client.post(start_url, headers=headers)).status_code == 403

    calls = _fake_face(monkeypatch, match=True)
    verified = await async_client.post(
        f"/general-test/{scene['test_id']}/verify_entry_face", json={"image_base64": "AAAA"}, headers=headers
    )
    assert verified.json()["verified"] is True
    # Etalon — profil surati: xodimda `Student` yo'q.
    assert calls == [PHOTO]

    started = await async_client.post(start_url, headers=headers)
    assert started.status_code == 200, started.text
    attempt_id = started.json()["attempt_id"]
    assert started.json()["proctoring_mode"] == "face_entry"

    # Tasdiqdan keyin sahifa ochiladi; tasdiq muddati o'tgach — yana yuz.
    assert (await async_client.get(f"/general-test/attempt/{attempt_id}", headers=headers)).status_code == 200
    await redis_client.delete(gt_repository._face_grant_key(attempt_id))
    reopened = await async_client.get(f"/general-test/attempt/{attempt_id}", headers=headers)
    assert reopened.status_code == 403
    assert reopened.json()["detail"]["code"] == "face_verification_required"

    # Tasdiq bir martalik: qaytish uchun ham yangi yuz kerak.
    assert (await async_client.post(start_url, headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_camera_mode_issues_token_and_closes_on_cheating(
    auth_client, async_client, async_db, scene  # noqa: F811
):
    await _prepare(auth_client, async_db, scene, "face")
    headers = await _login(async_client, "gt_staff")

    started = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)
    assert started.status_code == 200, started.text
    state = started.json()
    assert state["face_ws_token"]
    assert state["image_url"] == PHOTO

    cheated = await async_client.post(
        f"/general-test/attempt/{state['attempt_id']}/cheating", json={"kind": "multiple"}, headers=headers
    )
    assert cheated.status_code == 200, cheated.text
    assert cheated.json()["stop_reason"] == "Kadrda bir nechta odam"

    async_db.expire_all()
    attempt = (
        await async_db.execute(select(GeneralTestAttempt).where(GeneralTestAttempt.id == state["attempt_id"]))
    ).scalar_one()
    assert attempt.status == "completed"
    assert attempt.stop_reason == "Kadrda bir nechta odam"

    results = await auth_client.get("/general-test/results")
    assert results.json()["results"][0]["stop_reason"] == "Kadrda bir nechta odam"


@pytest.mark.asyncio
async def test_cheating_report_needs_camera_mode(auth_client, async_client, async_db, scene):  # noqa: F811
    await _prepare(auth_client, async_db, scene, "standard")
    headers = await _login(async_client, "gt_staff")
    started = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)
    assert started.json()["face_ws_token"] is None

    cheated = await async_client.post(
        f"/general-test/attempt/{started.json()['attempt_id']}/cheating", json={"kind": "different"}, headers=headers
    )
    assert cheated.status_code == 400


@pytest.mark.asyncio
async def test_update_without_mode_keeps_it(auth_client, scene):  # noqa: F811
    await auth_client.put(f"/general-test/{scene['test_id']}", json={"proctoring_mode": "face"})

    kept = await auth_client.put(f"/general-test/{scene['test_id']}", json={"duration": 45})
    assert kept.json()["proctoring_mode"] == "face"

    cleared = await auth_client.put(f"/general-test/{scene['test_id']}", json={"proctoring_mode": None})
    assert cleared.json()["proctoring_mode"] == "face"


@pytest.mark.asyncio
async def test_student_reference_is_hemis_photo_only(auth_client, async_client, async_db, scene):  # noqa: F811
    """Talabaning o'zi yuklagan surati etalon bo'lmaydi — faqat HEMIS surati."""
    await auth_client.put(f"/general-test/{scene['test_id']}", json={"proctoring_mode": "face"})
    added = await auth_client.post(f"/general-test/{scene['test_id']}/groups", json={"group_ids": [scene["group_id"]]})
    assert added.status_code == 200, added.text
    # `scene` dagi talabaning HEMIS surati bo'sh; profilga esa surat yuklagan.
    scene["student"].avatar_path = PHOTO
    await async_db.commit()

    started = await async_client.post(
        f"/general-test/{scene['test_id']}/start", headers=await _login(async_client, "gt_student")
    )

    assert started.status_code == 400
    assert started.json()["detail"]["code"] == "student_photo_missing"
