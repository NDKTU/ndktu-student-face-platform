"""Elementar test: imtihon paytida savollar banki.

2026-10-12: o'qituvchi test ketayotganda savollarni o'chirdi — talabalarning
javoblari saqlanmay qoldi (FK xatosi → 500), 40 ta urinish buzildi, kim
qilgani esa faqat fayl jurnalidan topildi. Endi:

* ketayotgan urinishdagi savolni o'chirib bo'lmaydi; vaqti o'tgani to'smaydi;
* variantlar va to'g'ri javobni ham o'zgartirib bo'lmaydi, savol matnini — mumkin;
* savol baribir yo'qolsa, javob 500 emas, 410 (`general_test_question_deleted`);
* tahrir va o'chirish audit jurnaliga yoziladi.
"""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.modules.audit.model import AuditLog
from app.modules.general_test.model import GeneralTestQuestion
from app.test.test_general_test_access import scene  # noqa: F401 — fixture
from app.test.test_general_test_timing import _attempt, _start_as_staff


@pytest.mark.asyncio
async def test_question_in_running_attempt_is_protected(auth_client, async_client, async_db, scene):  # noqa: F811
    _, state = await _start_as_staff(auth_client, async_client, scene)
    attempt = await _attempt(async_db, state["attempt_id"])
    question_id = attempt.layout[0]["q"]

    deleted = await auth_client.delete(f"/general-test/question/{question_id}")
    assert deleted.status_code == 409, deleted.text
    assert deleted.json()["detail"]["code"] == "general_test_question_in_use"
    assert deleted.json()["detail"]["attempts"] == 1

    locked = await auth_client.put(f"/general-test/question/{question_id}", json={"correct_option": "d"})
    assert locked.json()["detail"]["code"] == "general_test_question_locked"
    # Matndagi xatoni tuzatish — mumkin.
    fixed = await auth_client.put(f"/general-test/question/{question_id}", json={"text": "Tuzatilgan matn"})
    assert fixed.status_code == 200, fixed.text

    # Vaqti o'tgan, lekin yopilmagan urinish o'chirishni to'smaydi.
    attempt.started_at = attempt.started_at - timedelta(minutes=45)
    await async_db.commit()
    assert (await auth_client.delete(f"/general-test/question/{question_id}")).status_code == 204

    events = (
        await async_db.execute(
            select(AuditLog.event, AuditLog.object_id, AuditLog.meta).where(
                AuditLog.object_type == "general_test_question"
            )
        )
    ).all()
    assert [(e, o) for e, o, _ in events] == [
        ("general_test_question.updated", str(question_id)),
        ("general_test_question.deleted", str(question_id)),
    ]
    assert events[0][2]["changes"]["text"][1] == "Tuzatilgan matn"
    assert events[1][2]["text"] == "Tuzatilgan matn"


@pytest.mark.asyncio
async def test_answer_to_deleted_question_is_410(auth_client, async_client, async_db, scene):  # noqa: F811
    headers, state = await _start_as_staff(auth_client, async_client, scene)
    attempt = await _attempt(async_db, state["attempt_id"])
    gone = attempt.layout[0]["q"]
    # Himoyadan oldin (yoki to'g'ridan-to'g'ri bazada) o'chirilgan savol.
    await async_db.delete(await async_db.get(GeneralTestQuestion, gone))
    await async_db.commit()

    url = f"/general-test/attempt/{state['attempt_id']}/answer"
    lost = await async_client.post(url, json={"question_id": gone, "option": "a"}, headers=headers)
    assert lost.status_code == 410, lost.text
    assert lost.json()["detail"]["code"] == "general_test_question_deleted"
    # Urinish yopilmaydi: 410 butun testni emas, faqat shu savolni bildiradi.
    assert (await _attempt(async_db, state["attempt_id"])).status == "in_progress"
