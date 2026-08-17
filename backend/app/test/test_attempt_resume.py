"""Возвращение в прерванную попытку и закрытие истёкшей.

Проверяется через API: студент повторно вызывает start_quiz — ровно то, что
делает браузер после F5, обрыва связи или пересадки за другой компьютер.
"""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.auth.model import User
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Result, Subject, UserAnswers

PIN = "7777"


async def _setup(async_db, duration: int = 60) -> Quiz:
    subject = Subject(name="Resume Subject")
    async_db.add(subject)
    await async_db.commit()
    await async_db.refresh(subject)

    user = (await async_db.execute(select(User).where(User.username == "test_user"))).scalar_one()

    quiz = Quiz(
        title="Resume Quiz",
        subject_id=subject.id,
        question_number=3,
        duration=duration,
        is_active=True,
        pin=PIN,
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)

    for i in range(3):
        question = Question(
            text=f"Question {i}",
            option_a=f"a{i}",
            option_b=f"b{i}",
            option_c=f"c{i}",
            option_d=f"d{i}",
            correct_option="a",
            subject_id=subject.id,
            user_id=user.id,
        )
        async_db.add(question)
        await async_db.commit()
        await async_db.refresh(question)
        async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question.id))

    await async_db.commit()
    return quiz


def _shown(question_dto: dict) -> list[str]:
    return [question_dto[f"option_{letter}"] for letter in ("a", "b", "c", "d")]


@pytest.mark.asyncio
async def test_second_start_resumes_the_same_attempt(auth_client, async_db):
    """Повторный вход не создаёт вторую попытку — студент возвращается в свою."""
    quiz = await _setup(async_db)

    first = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()
    second = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()

    assert second["result_id"] == first["result_id"]
    assert second["resumed"] is True
    assert first["resumed"] is False

    attempts = (await async_db.execute(select(Result).where(Result.quiz_id == quiz.id))).scalars().all()
    assert len(attempts) == 1


@pytest.mark.asyncio
async def test_resume_keeps_questions_and_option_order(auth_client, async_db):
    """Иначе студент увидел бы другой бланк и уже данные ответы потеряли бы смысл."""
    quiz = await _setup(async_db)

    first = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()
    second = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()

    by_id_first = {q["id"]: _shown(q) for q in first["questions"]}
    by_id_second = {q["id"]: _shown(q) for q in second["questions"]}

    assert by_id_first.keys() == by_id_second.keys()
    for question_id, options in by_id_first.items():
        assert by_id_second[question_id] == options


@pytest.mark.asyncio
async def test_resume_returns_already_given_answers(auth_client, async_db):
    quiz = await _setup(async_db)

    first = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()
    question_dto = first["questions"][0]
    chosen_index = 2

    await auth_client.post(
        "/quiz_process/submit_answer",
        json={
            "result_id": first["result_id"],
            "question_id": question_dto["id"],
            "answer_index": chosen_index,
        },
    )

    second = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()

    restored = {a["question_id"]: a["answer_index"] for a in second["submitted_answers"]}
    assert restored.get(question_dto["id"]) == chosen_index


@pytest.mark.asyncio
async def test_remaining_time_does_not_reset_on_resume(auth_client, async_db):
    """Главное свойство: F5 больше не выдаёт полный запас времени заново."""
    quiz = await _setup(async_db)

    first = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()

    attempt = (await async_db.execute(select(Result).where(Result.id == first["result_id"]))).scalar_one()
    attempt.created_at = utcnow_naive() - timedelta(minutes=20)
    await async_db.commit()

    second = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()

    assert second["remaining_seconds"] < first["remaining_seconds"]
    assert 2350 <= second["remaining_seconds"] <= 2450  # ~40 минут из 60


@pytest.mark.asyncio
async def test_resume_works_after_quiz_was_deactivated(auth_client, async_db):
    """Ответственный закрывает вход, когда все зашли, — вернуться это мешать не должно."""
    quiz = await _setup(async_db)

    first = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()

    stored_quiz = (await async_db.execute(select(Quiz).where(Quiz.id == quiz.id))).scalar_one()
    stored_quiz.is_active = False
    stored_quiz.pin = "0000"
    await async_db.commit()

    response = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})

    assert response.status_code == 200
    assert response.json()["result_id"] == first["result_id"]


@pytest.mark.asyncio
async def test_expired_attempt_is_closed_and_graded(auth_client, async_db):
    quiz = await _setup(async_db, duration=10)

    first = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()
    question_dto = first["questions"][0]
    # Правильный вариант — тот, что лежал в option_a; его текст начинается с "a".
    shown = _shown(question_dto)
    correct_index = next(i for i, text in enumerate(shown) if text.startswith("a"))
    await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": first["result_id"], "question_id": question_dto["id"], "answer_index": correct_index},
    )

    attempt = (await async_db.execute(select(Result).where(Result.id == first["result_id"]))).scalar_one()
    attempt.created_at = utcnow_naive() - timedelta(minutes=30)
    await async_db.commit()

    response = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})

    assert response.status_code == 400

    await async_db.refresh(attempt)
    assert attempt.status == "completed"
    assert attempt.finished_at is not None
    # Оценка выставлена по тем ответам, что успели дойти.
    assert attempt.correct_answers == 1
    assert attempt.wrong_answers == 2


@pytest.mark.asyncio
async def test_answers_are_rejected_after_time_is_up(auth_client, async_db):
    """Раньше статус сам не менялся, и студент мог дописывать ответы сколько угодно."""
    quiz = await _setup(async_db, duration=10)

    first = (await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": PIN})).json()
    question_dto = first["questions"][0]

    attempt = (await async_db.execute(select(Result).where(Result.id == first["result_id"]))).scalar_one()
    attempt.created_at = utcnow_naive() - timedelta(minutes=30)
    await async_db.commit()

    response = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": first["result_id"], "question_id": question_dto["id"], "answer_index": 0},
    )

    assert response.status_code == 400

    await async_db.refresh(attempt)
    assert attempt.status == "completed"

    unanswered = (
        (await async_db.execute(select(UserAnswers).where(UserAnswers.result_id == first["result_id"]))).scalars().all()
    )
    assert all(row.answer is None for row in unanswered)
