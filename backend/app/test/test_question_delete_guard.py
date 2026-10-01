"""Testga olingan savol oʻchirilmaydi.

Nega muhim. Oʻchirish «yumshoq» (`is_active = False`), yaʼni qator
joyida qoladi va birinchi qarashda hech narsa buzilmaydiganday. Lekin
`start_quiz` faqat faol savollarni beradi: tayyor test jimgina
qisqarardi va allaqachon ishlagan talabalar bilan keyingilari aslida
boshqa testni yechardi — natijalar esa bitta jadvalda solishtirilardi.
"""

import pytest
import pytest_asyncio

from app.modules.quiz.model import Question, Quiz, QuizQuestion


@pytest_asyncio.fixture
async def question_in_bank(async_db, make_subject, test_user):
    subject = await make_subject("Oʻchirish sinovi fani")
    question = Question(
        text="Bankdagi savol",
        option_a="a",
        option_b="b",
        option_c="c",
        option_d="d",
        correct_option="a",
        subject_id=subject.id,
        user_id=test_user["id"],
    )
    async_db.add(question)
    await async_db.commit()
    await async_db.refresh(question)
    return {"question_id": question.id, "subject_id": subject.id, "user_id": test_user["id"]}


@pytest.mark.asyncio
async def test_unused_question_can_be_deleted(auth_client, async_db, question_in_bank):
    """Hech qaysi testda yoʻq savol — oʻchiriladi."""
    response = await auth_client.delete(f"/question/{question_in_bank['question_id']}")

    assert response.status_code in (200, 204), response.text
    question = await async_db.get(Question, question_in_bank["question_id"])
    await async_db.refresh(question)
    assert question.is_active is False


@pytest.mark.asyncio
async def test_question_used_in_quiz_is_protected(auth_client, async_db, question_in_bank):
    """Testga olingan savolni oʻchirib boʻlmaydi — 409 va tushunarli sabab."""
    quiz = Quiz(
        title="Sinov testi",
        subject_id=question_in_bank["subject_id"],
        question_number=1,
        duration=10,
        is_active=False,
        pin="4545",
        proctoring_mode="standard",
        lecturer_id=question_in_bank["user_id"],
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)
    async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question_in_bank["question_id"]))
    await async_db.commit()
    async_db.expire_all()

    response = await auth_client.delete(f"/question/{question_in_bank['question_id']}")

    assert response.status_code == 409, response.text
    question = await async_db.get(Question, question_in_bank["question_id"])
    assert question.is_active is True, "savol oʻchirilmasligi kerak"


@pytest.mark.asyncio
async def test_list_marks_questions_used_in_quizzes(auth_client, async_db, question_in_bank, make_subject):
    """Roʻyxat qaysi savol testda ekanini aytadi.

    Front shu bayroq boʻyicha «oʻchirish» tugmasini yopadi: aks holda
    oʻqituvchi tugmani bosib, faqat xato xabarini koʻrardi.
    """
    free = Question(
        text="Erkin savol",
        option_a="a",
        option_b="b",
        option_c="c",
        option_d="d",
        correct_option="a",
        subject_id=question_in_bank["subject_id"],
        user_id=question_in_bank["user_id"],
    )
    async_db.add(free)
    await async_db.commit()

    quiz = Quiz(
        title="Sinov testi",
        subject_id=question_in_bank["subject_id"],
        question_number=1,
        duration=10,
        is_active=False,
        pin="4646",
        proctoring_mode="standard",
        lecturer_id=question_in_bank["user_id"],
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)
    async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question_in_bank["question_id"]))
    await async_db.commit()
    async_db.expire_all()

    response = await auth_client.get(
        "/question/", params={"subject_id": question_in_bank["subject_id"], "limit": 50}
    )

    assert response.status_code == 200, response.text
    by_text = {q["text"]: q["in_quiz"] for q in response.json()["questions"]}
    assert by_text["Bankdagi savol"] is True
    assert by_text["Erkin savol"] is False
