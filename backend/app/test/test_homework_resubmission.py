"""Uy vazifasi: rad etish va qayta topshirish.

O'qituvchi ishni baholamay rad etadi (sabab majburiy) yoki baholangan ishni
past baho uchun qayta topshirishga qaytaradi. Ikkala holda ham talaba yangi
javob yuboradi, eskisi `attempts` ga ko'chadi, talaba bildirishnoma oladi.
"""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.modules.course.model import Homework, HomeworkSubmission
from app.modules.notification.model import Notification

from app.test.test_file_source_by_role import PNG, _enrolled_student_homework, _headers, temp_uploads  # noqa: F401


async def _submit(async_client, homework_id: int, headers: dict, name: str = "javob.png"):
    uploaded = await async_client.post(
        f"/homework/{homework_id}/upload", files={"file": (name, PNG, "image/png")}, headers=headers
    )
    assert uploaded.status_code == 200, uploaded.text
    return await async_client.post(
        f"/homework/{homework_id}/submit", json={"submitted_files": [uploaded.json()]}, headers=headers
    )


@pytest.mark.asyncio
async def test_low_grade_returned_and_resubmitted(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject, test_group, test_teacher  # noqa: F811
):
    student, homework = await _enrolled_student_homework(
        async_db, test_kafedra, test_subject, test_group, test_teacher
    )
    headers = await _headers(async_client, "fs_student")
    assert (await _submit(async_client, homework.id, headers)).status_code == 201

    graded = await auth_client.put(
        f"/homework/{homework.id}/submission/{student.id}/grade", json={"grade": 2, "feedback": "Yetarli emas"}
    )
    assert graded.status_code == 200, graded.text

    returned = await auth_client.put(
        f"/homework/{homework.id}/submission/{student.id}/return", json={"comment": "Xulosani to'ldiring"}
    )
    assert returned.status_code == 200, returned.text
    body = returned.json()
    # Eski baho yangisi qo'yilguncha turadi.
    assert body["status"] == "returned"
    assert body["grade"] == 2
    assert body["feedback"] == "Xulosani to'ldiring"

    notes = (await async_db.execute(select(Notification).where(Notification.user_id == student.id))).scalars().all()
    assert len(notes) == 1 and notes[0].payload["homework_id"] == homework.id

    resubmitted = await _submit(async_client, homework.id, headers, name="yangi.png")
    assert resubmitted.status_code == 201, resubmitted.text
    body = resubmitted.json()
    assert body["status"] == "submitted"
    assert body["grade"] is None
    assert len(body["attempts"]) == 1
    assert body["attempts"][0]["status"] == "returned"
    assert body["attempts"][0]["grade"] == 2
    assert body["submitted_files"][0]["name"] == "yangi.png"

    # Qayta topshirilgan ish yana yopiq: uchinchi javob faqat yangi qaytarishdan keyin.
    blocked = await async_client.post(
        f"/homework/{homework.id}/upload", files={"file": ("uchinchi.png", PNG, "image/png")}, headers=headers
    )
    assert blocked.status_code == 409

    regraded = await auth_client.put(
        f"/homework/{homework.id}/submission/{student.id}/grade", json={"grade": 5}
    )
    assert regraded.status_code == 200 and regraded.json()["grade"] == 5


@pytest.mark.asyncio
async def test_rejected_without_grade_and_reason_required(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject, test_group, test_teacher  # noqa: F811
):
    student, homework = await _enrolled_student_homework(
        async_db, test_kafedra, test_subject, test_group, test_teacher
    )
    headers = await _headers(async_client, "fs_student")
    assert (await _submit(async_client, homework.id, headers)).status_code == 201

    # Baholanmagan ishni «past baho» uchun qaytarib bo'lmaydi.
    early_return = await auth_client.put(f"/homework/{homework.id}/submission/{student.id}/return", json={})
    assert early_return.status_code == 409

    no_reason = await auth_client.put(f"/homework/{homework.id}/submission/{student.id}/reject", json={"reason": ""})
    assert no_reason.status_code == 422

    rejected = await auth_client.put(
        f"/homework/{homework.id}/submission/{student.id}/reject", json={"reason": "Boshqa vazifa fayli yuklangan"}
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["grade"] is None

    again = await auth_client.put(
        f"/homework/{homework.id}/submission/{student.id}/reject", json={"reason": "Yana bir bor"}
    )
    assert again.status_code == 409

    resubmitted = await _submit(async_client, homework.id, headers)
    assert resubmitted.status_code == 201, resubmitted.text
    assert resubmitted.json()["attempts"][0]["feedback"] == "Boshqa vazifa fayli yuklangan"


@pytest.mark.asyncio
async def test_resubmission_after_deadline_is_not_late(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject, test_group, test_teacher  # noqa: F811
):
    """Qaytarishni o'qituvchi so'ragan — muddatdan keyingi ikkinchi javob jazolanmaydi."""
    student, homework = await _enrolled_student_homework(
        async_db, test_kafedra, test_subject, test_group, test_teacher
    )
    headers = await _headers(async_client, "fs_student")
    assert (await _submit(async_client, homework.id, headers)).status_code == 201

    # Birinchi javob muddatgacha, qayta topshirish — muddatdan keyin.
    row = await async_db.get(Homework, homework.id)
    row.deadline = datetime.now() - timedelta(days=1)
    sub = (
        await async_db.execute(select(HomeworkSubmission).where(HomeworkSubmission.homework_id == homework.id))
    ).scalar_one()
    sub.submitted_at = datetime.now() - timedelta(days=2)
    sub.status = "submitted"
    await async_db.commit()

    rejected = await auth_client.put(
        f"/homework/{homework.id}/submission/{student.id}/reject", json={"reason": "Fayl o'qilmaydi"}
    )
    assert rejected.status_code == 200, rejected.text

    resubmitted = await _submit(async_client, homework.id, headers)
    assert resubmitted.status_code == 201, resubmitted.text
    body = resubmitted.json()
    assert body["status"] == "submitted"
    assert body["first_submitted_at"] == body["attempts"][0]["submitted_at"]

    await async_db.refresh(sub)
    assert len(sub.attempts) == 1
