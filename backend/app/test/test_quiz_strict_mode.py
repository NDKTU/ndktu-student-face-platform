"""Qat'iy rejim: sahifadan chiqqan talabaning urinishi serverda yopiladi.

Brauzer `leave` yuboradi, lekin unga tayanilmaydi: heartbeat to'xtasa yoki
talaba sahifani qayta ochsa, urinish baribir yopiladi.
"""

from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.core.redis_client import redis_client
from app.modules.auth.model import User
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Result, Subject
from app.modules.quiz.quiz_process.strict import _key


async def _setup_quiz(async_db, *, strict_mode: bool = True) -> Quiz:
    subject = Subject(name="Strict Subject")
    async_db.add(subject)
    await async_db.commit()
    await async_db.refresh(subject)

    user = (await async_db.execute(select(User).where(User.username == "test_user"))).scalar_one()

    question = Question(
        text="2+2?",
        option_a="4",
        option_b="3",
        option_c="5",
        option_d="6",
        correct_option="a",
        subject_id=subject.id,
        user_id=user.id,
    )
    async_db.add(question)
    await async_db.commit()
    await async_db.refresh(question)

    quiz = Quiz(
        title="Strict Quiz",
        subject_id=subject.id,
        question_number=1,
        duration=10,
        is_active=True,
        pin="2468",
        strict_mode=strict_mode,
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)

    async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question.id))
    await async_db.commit()
    return quiz


async def _start(auth_client, quiz: Quiz) -> dict:
    response = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "2468"})
    assert response.status_code == 200, response.text
    return response.json()


async def _result(async_db, result_id: int) -> Result:
    return (
        await async_db.execute(
            select(Result).where(Result.id == result_id).execution_options(populate_existing=True)
        )
    ).scalar_one()


def _code(response) -> str:
    return response.json()["detail"]["code"]


@pytest.mark.asyncio
async def test_leave_closes_attempt(auth_client, async_db):
    quiz = await _setup_quiz(async_db)
    data = await _start(auth_client, quiz)
    assert data["strict_mode"] is True

    leave = await auth_client.post("/quiz_process/leave", json={"result_id": data["result_id"], "reason": "blur"})
    assert leave.status_code == 200
    assert leave.json()["cheating_detected"] is True

    result = await _result(async_db, data["result_id"])
    assert result.status == "completed"
    assert result.cheating_detected is True
    assert result.reason_for_stop == "Boshqa oynaga o'tdi"

    question_id = data["questions"][0]["id"]
    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": question_id, "answer_index": 0},
    )
    assert submit.status_code == 400
    assert _code(submit) == "attempt_already_finished"

    # `blur` dan keyin `pagehide` ham keladi — xato bo'lmasligi kerak.
    again = await auth_client.post("/quiz_process/leave", json={"result_id": data["result_id"], "reason": "pagehide"})
    assert again.status_code == 200
    assert (await _result(async_db, data["result_id"])).reason_for_stop == "Boshqa oynaga o'tdi"


@pytest.mark.asyncio
async def test_unknown_reason_is_not_stored_verbatim(auth_client, async_db):
    quiz = await _setup_quiz(async_db)
    data = await _start(auth_client, quiz)

    await auth_client.post("/quiz_process/leave", json={"result_id": data["result_id"], "reason": "<b>hack</b>"})

    assert (await _result(async_db, data["result_id"])).reason_for_stop == "Sahifadan chiqdi"


@pytest.mark.asyncio
async def test_reopening_page_closes_attempt(auth_client, async_db):
    quiz = await _setup_quiz(async_db)
    data = await _start(auth_client, quiz)
    await async_db.execute(
        update(Result)
        .where(Result.id == data["result_id"])
        .values(created_at=Result.created_at - timedelta(minutes=1))
    )
    await async_db.commit()

    again = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "2468"})

    assert again.status_code == 409
    assert _code(again) == "attempt_closed_left_page"
    result = await _result(async_db, data["result_id"])
    assert result.status == "completed"
    assert result.reason_for_stop == "Sahifani qayta ochdi"


@pytest.mark.asyncio
async def test_immediate_retry_of_start_resumes(auth_client, async_db):
    """`start_quiz` javobi yo'qolgan talaba qayta bosganda «ko'chirdi» bo'lmaydi."""
    quiz = await _setup_quiz(async_db)
    data = await _start(auth_client, quiz)

    again = await _start(auth_client, quiz)

    assert again["resumed"] is True
    assert again["result_id"] == data["result_id"]


@pytest.mark.asyncio
async def test_missing_heartbeat_closes_on_submit(auth_client, async_db):
    quiz = await _setup_quiz(async_db)
    data = await _start(auth_client, quiz)
    await redis_client.delete(_key(data["result_id"]))

    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": data["questions"][0]["id"], "answer_index": 0},
    )

    assert submit.status_code == 409
    assert _code(submit) == "attempt_closed_left_page"
    result = await _result(async_db, data["result_id"])
    assert result.status == "completed"
    assert result.reason_for_stop == "Aloqa uzildi"


@pytest.mark.asyncio
async def test_late_heartbeat_does_not_revive_attempt(auth_client, async_db):
    """Fonda muzlagan sahifa qaytganda birinchi heartbeat chiqishni yashirmasligi kerak."""
    quiz = await _setup_quiz(async_db)
    data = await _start(auth_client, quiz)

    alive = await auth_client.post("/quiz_process/heartbeat", json={"result_id": data["result_id"]})
    assert alive.status_code == 200

    await redis_client.delete(_key(data["result_id"]))
    late = await auth_client.post("/quiz_process/heartbeat", json={"result_id": data["result_id"]})

    assert late.status_code == 409
    assert (await _result(async_db, data["result_id"])).status == "completed"


@pytest.mark.asyncio
async def test_regular_quiz_ignores_strict_endpoints(auth_client, async_db):
    quiz = await _setup_quiz(async_db, strict_mode=False)
    data = await _start(auth_client, quiz)
    assert data["strict_mode"] is False

    leave = await auth_client.post("/quiz_process/leave", json={"result_id": data["result_id"]})
    assert leave.status_code == 400
    assert _code(leave) == "strict_mode_disabled"

    # Heartbeat yo'q, lekin oddiy testda javob qabul qilinadi va qaytish ishlaydi.
    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": data["questions"][0]["id"], "answer_index": 0},
    )
    assert submit.status_code == 200
    assert (await _start(auth_client, quiz))["resumed"] is True


@pytest.mark.asyncio
async def test_update_without_flag_keeps_strict_mode(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]
    payload = {
        "title": "Strict flag quiz",
        "question_number": 5,
        "duration": 30,
        "pin": "9999",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "strict_mode": True,
    }
    created = await auth_client.post("/quiz/", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["strict_mode"] is True
    quiz_id = created.json()["id"]

    payload.pop("strict_mode")
    payload["title"] = "Strict flag quiz 2"
    updated = await auth_client.put(f"/quiz/{quiz_id}", json=payload)
    assert updated.status_code == 200
    assert updated.json()["strict_mode"] is True

    payload["strict_mode"] = False
    switched_off = await auth_client.put(f"/quiz/{quiz_id}", json=payload)
    assert switched_off.json()["strict_mode"] is False


@pytest.mark.asyncio
async def test_hold_to_reveal_reaches_test_page_and_survives_update(auth_client, async_db, test_subject, test_group):
    quiz = await _setup_quiz(async_db, strict_mode=False)
    quiz.hold_to_reveal = True
    await async_db.commit()
    assert (await _start(auth_client, quiz))["hold_to_reveal"] is True

    users_resp = await auth_client.get("/user/")
    payload = {
        "title": "Hidden text quiz",
        "question_number": 5,
        "duration": 30,
        "pin": "9999",
        "user_id": users_resp.json()["users"][0]["id"],
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "hold_to_reveal": True,
    }
    created = await auth_client.post("/quiz/", json=payload)
    assert created.json()["hold_to_reveal"] is True
    payload.pop("hold_to_reveal")
    updated = await auth_client.put(f"/quiz/{created.json()['id']}", json=payload)
    assert updated.json()["hold_to_reveal"] is True
