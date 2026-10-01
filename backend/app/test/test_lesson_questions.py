"""Savol darsga bogʻlanadi, dars testi esa oʻsha savollardan yigʻiladi.

Ilgari savol faqat FANGA bogʻlanardi. Oʻqituvchi dars sahifasida savol
qoʻshardi, lekin kurs ichida ularni koʻra olmasdi, dars testi esa butun
semestrning bankidan yigʻilardi — bitta mavzuning testiga boshqa
mavzularning savollari tushardi.
"""

from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.auth.model import TeacherSubject
from app.modules.course.model import Course, Lesson
from app.modules.quiz.model import Question, Quiz, QuizQuestion


@pytest_asyncio.fixture
async def lesson_setup(async_db, make_teacher, make_subject, make_group, test_faculty, test_kafedra, test_user):
    """Kurs, ikkita dars va oʻqituvchi-fan juftligi."""
    teacher = await make_teacher("lq_teacher", test_kafedra["id"])
    subject = await make_subject("Dars savollari fani")
    group = await make_group("LQ-1", test_faculty["id"])
    link = TeacherSubject(teacher_id=teacher["id"], subject_id=subject.id)
    async_db.add(link)
    await async_db.commit()
    await async_db.refresh(link)

    course = Course(name="LQ kurs", subject_id=subject.id, teacher_id=teacher["user_id"])
    async_db.add(course)
    await async_db.commit()
    await async_db.refresh(course)

    lessons = []
    for num in (1, 2):
        lesson = Lesson(
            teacher_subject_id=link.id,
            group_id=group["id"],
            course_id=course.id,
            topic=f"{num}-mavzu",
            date=date(2026, 10, num),
        )
        async_db.add(lesson)
        await async_db.commit()
        await async_db.refresh(lesson)
        lessons.append(lesson.id)

    return {
        "subject_id": subject.id,
        "group_id": group["id"],
        "teacher_user_id": teacher["user_id"],
        "lesson_ids": lessons,
        "admin_user_id": test_user["id"],
    }


async def _add_question(async_db, *, subject_id: int, user_id: int, lesson_id: int | None, text: str):
    question = Question(
        text=text,
        option_a="a",
        option_b="b",
        option_c="c",
        option_d="d",
        correct_option="a",
        subject_id=subject_id,
        user_id=user_id,
        lesson_id=lesson_id,
    )
    async_db.add(question)
    await async_db.commit()
    await async_db.refresh(question)
    return question.id


# ───────────────────── Savol darsga bogʻlanadi ─────────────────────


@pytest.mark.asyncio
async def test_question_created_from_lesson_keeps_the_link(auth_client, async_db, lesson_setup):
    """Dars sahifasidan qoʻshilgan savol oʻsha darsga yoziladi."""
    lesson_id = lesson_setup["lesson_ids"][0]

    response = await auth_client.post(
        "/question/",
        json={
            "subject_id": lesson_setup["subject_id"],
            "user_id": lesson_setup["admin_user_id"],
            "lesson_id": lesson_id,
            "text": "Darsning savoli",
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
            "correct_option": "a",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["lesson_id"] == lesson_id


@pytest.mark.asyncio
async def test_question_list_filters_by_lesson(auth_client, async_db, lesson_setup):
    """Dars sahifasi faqat oʻz savollarini soʻraydi."""
    first, second = lesson_setup["lesson_ids"]
    await _add_question(
        async_db, subject_id=lesson_setup["subject_id"],
        user_id=lesson_setup["admin_user_id"], lesson_id=first, text="Birinchi mavzu",
    )
    await _add_question(
        async_db, subject_id=lesson_setup["subject_id"],
        user_id=lesson_setup["admin_user_id"], lesson_id=second, text="Ikkinchi mavzu",
    )
    await _add_question(
        async_db, subject_id=lesson_setup["subject_id"],
        user_id=lesson_setup["admin_user_id"], lesson_id=None, text="Umumiy bank savoli",
    )

    response = await auth_client.get("/question/", params={"lesson_id": first, "limit": 50})

    assert response.status_code == 200, response.text
    body = response.json()
    assert [q["text"] for q in body["questions"]] == ["Birinchi mavzu"]
    assert body["total"] == 1, "sanoq ham filtrga boʻysunishi kerak"


@pytest.mark.asyncio
async def test_editing_question_keeps_lesson(auth_client, async_db, lesson_setup):
    """Tahrirlash yangi versiya yaratadi — dars bogʻlanishi yoʻqolmaydi.

    Aks holda savol tahrirlangan zahoti oʻz darsidan tushib qolardi va
    dars testi uni boshqa olmasdi.
    """
    lesson_id = lesson_setup["lesson_ids"][0]
    question_id = await _add_question(
        async_db, subject_id=lesson_setup["subject_id"],
        user_id=lesson_setup["admin_user_id"], lesson_id=lesson_id, text="Eski matn",
    )
    async_db.expire_all()

    response = await auth_client.put(
        f"/question/{question_id}",
        json={
            "subject_id": lesson_setup["subject_id"],
            "user_id": lesson_setup["admin_user_id"],
            "text": "Yangi matn",
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
            "correct_option": "a",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["lesson_id"] == lesson_id


# ─────────────── Dars testi oʻsha darsning savollaridan ───────────────


@pytest.mark.asyncio
async def test_lesson_quiz_takes_only_its_own_questions(auth_client, async_db, lesson_setup):
    """Boshqa mavzuning va umumiy bankning savollari testga tushmaydi."""
    first, second = lesson_setup["lesson_ids"]
    lecturer = lesson_setup["teacher_user_id"]
    await _add_question(async_db, subject_id=lesson_setup["subject_id"],
                        user_id=lecturer, lesson_id=first, text="1-mavzu savoli")
    await _add_question(async_db, subject_id=lesson_setup["subject_id"],
                        user_id=lecturer, lesson_id=second, text="2-mavzu savoli")
    await _add_question(async_db, subject_id=lesson_setup["subject_id"],
                        user_id=lecturer, lesson_id=None, text="Umumiy savol")
    async_db.expire_all()

    response = await auth_client.post(
        "/quiz/",
        json={
            "lesson_id": first,
            "question_number": 1,
            "duration": 10,
            "pin": "7171",
            "is_active": False,
            "quiz_type": "LESSON_QUIZ",
            "proctoring_mode": "standard",
        },
    )

    assert response.status_code == 201, response.text
    quiz_id = response.json()["id"]
    texts = (
        await async_db.execute(
            select(Question.text)
            .join(QuizQuestion, QuizQuestion.question_id == Question.id)
            .where(QuizQuestion.quiz_id == quiz_id)
        )
    ).scalars().all()

    assert texts == ["1-mavzu savoli"]


@pytest.mark.asyncio
async def test_available_count_is_per_lesson(auth_client, async_db, lesson_setup):
    """«Bankda mavjud savollar» ham dars boʻyicha sanaladi.

    Raqam testga tushadigan savollar bilan bir xil boʻlishi kerak: aks
    holda oʻqituvchi «20 ta savol bor» deb koʻrib, 3 ta savolli test
    olardi.
    """
    first, second = lesson_setup["lesson_ids"]
    lecturer = lesson_setup["teacher_user_id"]
    for i in range(3):
        await _add_question(async_db, subject_id=lesson_setup["subject_id"],
                            user_id=lecturer, lesson_id=first, text=f"1-mavzu {i}")
    for i in range(5):
        await _add_question(async_db, subject_id=lesson_setup["subject_id"],
                            user_id=lecturer, lesson_id=second, text=f"2-mavzu {i}")
    async_db.expire_all()

    from app.modules.quiz.quiz.repository import get_quiz_repository

    only_lesson = await get_quiz_repository.count_available_questions(
        session=async_db, lecturer_id=lecturer,
        subject_id=lesson_setup["subject_id"], lesson_id=first,
    )
    whole_subject = await get_quiz_repository.count_available_questions(
        session=async_db, lecturer_id=lecturer, subject_id=lesson_setup["subject_id"],
    )

    assert only_lesson == 3
    assert whole_subject == 8, "darssiz soʻralganda butun fan banki sanaladi"


# ──────────── Dars testlari umumiy roʻyxatda yashiriladi ────────────


@pytest.mark.asyncio
async def test_has_lesson_filter_splits_the_list(auth_client, async_db, lesson_setup):
    """`has_lesson` dars testlarini ajratadi.

    «Testlar» sahifasi `false` yuboradi: dars testlari kurs ichida
    koʻrinadi va umumiy roʻyxatni toʻldirmaydi. Talaba yoʻli hech narsa
    yubormaydi, shuning uchun unga hammasi koʻrinaveradi.
    """
    lesson_id = lesson_setup["lesson_ids"][0]
    lesson_quiz = Quiz(
        title="Dars testi", subject_id=lesson_setup["subject_id"],
        group_id=lesson_setup["group_id"], lesson_id=lesson_id,
        question_number=1, duration=10, is_active=False, pin="8181",
        proctoring_mode="standard", lecturer_id=lesson_setup["teacher_user_id"],
    )
    plain_quiz = Quiz(
        title="Oddiy test", subject_id=lesson_setup["subject_id"],
        group_id=lesson_setup["group_id"], lesson_id=None,
        question_number=1, duration=10, is_active=False, pin="8282",
        proctoring_mode="standard", lecturer_id=lesson_setup["teacher_user_id"],
    )
    async_db.add_all([lesson_quiz, plain_quiz])
    await async_db.commit()
    async_db.expire_all()

    hidden = await auth_client.get("/quiz/", params={"has_lesson": False, "limit": 50})
    only_lesson = await auth_client.get("/quiz/", params={"has_lesson": True, "limit": 50})
    everything = await auth_client.get("/quiz/", params={"limit": 50})

    assert [q["title"] for q in hidden.json()["quizzes"]] == ["Oddiy test"]
    assert hidden.json()["total"] == 1
    assert [q["title"] for q in only_lesson.json()["quizzes"]] == ["Dars testi"]
    assert everything.json()["total"] == 2


@pytest.mark.asyncio
async def test_lesson_quiz_takes_questions_of_any_author(auth_client, async_db, lesson_setup):
    """Darsga kim savol qoʻshgani muhim emas.

    Amalda savollarni koʻpincha admin yoki yordamchi yuklaydi, maʼruzachi
    esa boshqa hisob. Bank muallif boʻyicha kesilsa, dars testi boʻsh
    chiqardi — brauzerda aynan shunday boʻldi.
    """
    lesson_id = lesson_setup["lesson_ids"][0]
    await _add_question(
        async_db, subject_id=lesson_setup["subject_id"],
        user_id=lesson_setup["admin_user_id"],  # ← maʼruzachi EMAS
        lesson_id=lesson_id, text="Admin yuklagan savol",
    )
    async_db.expire_all()

    response = await auth_client.post(
        "/quiz/",
        json={
            "lesson_id": lesson_id,
            "question_number": 1,
            "duration": 10,
            "pin": "7272",
            "is_active": False,
            "quiz_type": "LESSON_QUIZ",
            "proctoring_mode": "standard",
        },
    )

    assert response.status_code == 201, response.text
    linked = (
        await async_db.execute(
            select(Question.text)
            .join(QuizQuestion, QuizQuestion.question_id == Question.id)
            .where(QuizQuestion.quiz_id == response.json()["id"])
        )
    ).scalars().all()
    assert linked == ["Admin yuklagan savol"]
