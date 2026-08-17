"""Ответ по позиции варианта, а не по его тексту.

Проверяется через API, без обращения к внутренностям расстановки: тест находит
нужный вариант среди показанных и отправляет его позицию — ровно так же, как это
делает браузер.
"""

import pytest
from sqlalchemy import select

from app.modules.auth.model import User
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Subject, UserAnswers


async def _setup_quiz(async_db, options: dict[str, str], correct_option: str) -> tuple[Quiz, Question]:
    subject = Subject(name="Index Answer Subject")
    async_db.add(subject)
    await async_db.commit()
    await async_db.refresh(subject)

    user = (await async_db.execute(select(User).where(User.username == "test_user"))).scalar_one()

    question = Question(
        text="Question text",
        correct_option=correct_option,
        subject_id=subject.id,
        user_id=user.id,
        **options,
    )
    async_db.add(question)
    await async_db.commit()
    await async_db.refresh(question)

    quiz = Quiz(
        title="Index Answer Quiz",
        subject_id=subject.id,
        question_number=1,
        duration=10,
        is_active=True,
        pin="4321",
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)

    async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question.id))
    await async_db.commit()

    return quiz, question


def _shown_options(question_dto: dict) -> list[str]:
    return [question_dto[f"option_{letter}"] for letter in ("a", "b", "c", "d")]


@pytest.mark.asyncio
async def test_correct_answer_by_index(auth_client, async_db):
    quiz, _ = await _setup_quiz(
        async_db,
        options={"option_a": "4", "option_b": "3", "option_c": "5", "option_d": "6"},
        correct_option="a",
    )

    start = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "4321"})
    assert start.status_code == 200
    data = start.json()
    question_dto = data["questions"][0]

    # Браузер знает только показанный порядок — ищем нужный вариант в нём.
    answer_index = _shown_options(question_dto).index("4")

    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": question_dto["id"], "answer_index": answer_index},
    )

    assert submit.status_code == 200
    assert submit.json()["is_correct"] is True

    stored = (
        await async_db.execute(select(UserAnswers).where(UserAnswers.result_id == data["result_id"]))
    ).scalar_one()
    # Текст в отчёт кладёт сервер из базы, а не клиент из запроса.
    assert stored.answer == "4"
    assert stored.correct_answer == "4"


@pytest.mark.asyncio
async def test_wrong_answer_by_index(auth_client, async_db):
    quiz, _ = await _setup_quiz(
        async_db,
        options={"option_a": "4", "option_b": "3", "option_c": "5", "option_d": "6"},
        correct_option="a",
    )

    start = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "4321"})
    data = start.json()
    question_dto = data["questions"][0]
    answer_index = _shown_options(question_dto).index("3")

    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": question_dto["id"], "answer_index": answer_index},
    )

    assert submit.status_code == 200
    assert submit.json()["is_correct"] is False


@pytest.mark.asyncio
async def test_duplicate_option_text_is_graded_by_position(auth_client, async_db):
    """Раньше выбор любого из двух «0» засчитывался верным — сравнивались тексты."""
    quiz, _ = await _setup_quiz(
        async_db,
        options={"option_a": "0", "option_b": "1", "option_c": "0", "option_d": "-1"},
        correct_option="c",
    )

    start = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "4321"})
    data = start.json()
    question_dto = data["questions"][0]

    shown = _shown_options(question_dto)
    zero_positions = [i for i, text in enumerate(shown) if text == "0"]
    assert len(zero_positions) == 2

    verdicts = []
    for position in zero_positions:
        submit = await auth_client.post(
            "/quiz_process/submit_answer",
            json={"result_id": data["result_id"], "question_id": question_dto["id"], "answer_index": position},
        )
        assert submit.status_code == 200
        verdicts.append(submit.json()["is_correct"])

    # Один из двух одинаковых по тексту вариантов верен, другой — нет.
    assert sorted(verdicts) == [False, True]


@pytest.mark.asyncio
async def test_index_out_of_range_is_rejected(auth_client, async_db):
    quiz, _ = await _setup_quiz(
        async_db,
        options={"option_a": "4", "option_b": "3", "option_c": "5", "option_d": "6"},
        correct_option="a",
    )

    start = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "4321"})
    data = start.json()
    question_dto = data["questions"][0]

    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": question_dto["id"], "answer_index": 9},
    )

    assert submit.status_code == 400


@pytest.mark.asyncio
async def test_legacy_text_answer_still_accepted(auth_client, async_db):
    """Вкладка, открытая до выкатки, продолжает слать текст — обрывать её нельзя."""
    quiz, _ = await _setup_quiz(
        async_db,
        options={"option_a": "4", "option_b": "3", "option_c": "5", "option_d": "6"},
        correct_option="a",
    )

    start = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "4321"})
    data = start.json()
    question_dto = data["questions"][0]

    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": question_dto["id"], "answer": "4"},
    )

    assert submit.status_code == 200
    assert submit.json()["is_correct"] is True


@pytest.mark.asyncio
async def test_request_without_answer_is_rejected(auth_client, async_db):
    quiz, _ = await _setup_quiz(
        async_db,
        options={"option_a": "4", "option_b": "3", "option_c": "5", "option_d": "6"},
        correct_option="a",
    )

    start = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "4321"})
    data = start.json()
    question_dto = data["questions"][0]

    submit = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": data["result_id"], "question_id": question_dto["id"]},
    )

    assert submit.status_code == 400
