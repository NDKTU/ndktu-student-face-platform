"""Kurs nazorati — tanlangan darslar, «Test savollari» va alohida savollardan.

O'qituvchi «Fan topshiriqlari» da oraliq nazorat tuzadi: qaysi darslarning
savollari kirishini tanlaydi va xohlasa testning o'ziga savol qo'shadi.
"""

from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.auth.model import TeacherSubject
from app.modules.course.model import Course, CourseGroup, Lesson
from app.modules.quiz.model import Question, Quiz, QuizLesson, QuizQuestion, UserAnswers
from app.test.test_lesson_quiz_visibility import student_client  # noqa: F401 — fixture


@pytest_asyncio.fixture
async def midterm_setup(async_db, make_teacher, make_subject, make_group, test_faculty, test_kafedra):
    """Kurs, unga biriktirilgan guruh va uchta dars."""
    teacher = await make_teacher("mt_teacher", test_kafedra["id"])
    subject = await make_subject("Oraliq nazorat fani")
    group = await make_group("MT-1", test_faculty["id"])
    link = TeacherSubject(teacher_id=teacher["id"], subject_id=subject.id)
    async_db.add(link)
    await async_db.commit()
    await async_db.refresh(link)

    course = Course(name="MT kurs", subject_id=subject.id, teacher_id=teacher["user_id"])
    async_db.add(course)
    await async_db.commit()
    await async_db.refresh(course)
    async_db.add(CourseGroup(course_id=course.id, group_id=group["id"]))

    lessons = []
    for num in (1, 2, 3):
        lesson = Lesson(
            teacher_subject_id=link.id,
            group_id=None,
            course_id=course.id,
            topic=f"{num}-mavzu",
            date=date(2026, 10, num),
        )
        async_db.add(lesson)
        await async_db.commit()
        await async_db.refresh(lesson)
        lessons.append(lesson.id)

    return {
        "course_id": course.id,
        "subject_id": subject.id,
        "group_id": group["id"],
        "teacher_user_id": teacher["user_id"],
        "lesson_ids": lessons,
    }


async def _add_question(
    async_db,
    *,
    subject_id: int,
    user_id: int,
    lesson_id: int | None,
    text: str,
    course_id: int | None = None,
    control_type: str | None = None,
) -> int:
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
        course_id=course_id,
        control_type=control_type,
    )
    async_db.add(question)
    await async_db.commit()
    await async_db.refresh(question)
    return question.id


async def _linked(async_db, quiz_id: int) -> set[int]:
    async_db.expire_all()
    rows = await async_db.execute(select(QuizQuestion.question_id).where(QuizQuestion.quiz_id == quiz_id))
    return set(rows.scalars().all())


def _payload(setup, **extra):
    return {
        "quiz_type": "MIDTERM",
        "control_type": "ON1",
        "course_id": setup["course_id"],
        "question_number": 2,
        "duration": 30,
        "pin": "4321",
        "is_active": False,
        **extra,
    }


@pytest.mark.asyncio
async def test_midterm_collects_questions_from_selected_lessons(auth_client, async_db, midterm_setup):
    s = midterm_setup
    l1, l2, l3 = s["lesson_ids"]
    q1 = await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l1, text="1")
    q2 = await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l2, text="2")
    await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l3, text="3")
    # Fan bankidagi, darssiz savol — oraliq nazoratga tushmasligi kerak.
    await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=None, text="b")

    response = await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[l1, l2]))

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["quiz_type"] == "MIDTERM"
    assert body["course_id"] == s["course_id"]
    assert body["subject_id"] == s["subject_id"]
    assert body["lecturer_id"] == s["teacher_user_id"]
    assert body["lesson_id"] is None
    assert body["lesson_ids"] == [l1, l2]
    assert body["linked_question_count"] == 2
    assert await _linked(async_db, body["id"]) == {q1, q2}


@pytest.mark.asyncio
async def test_lesson_from_other_course_is_rejected(auth_client, async_db, midterm_setup):
    s = midterm_setup
    other = Course(name="Begona", subject_id=s["subject_id"], teacher_id=s["teacher_user_id"])
    async_db.add(other)
    await async_db.commit()
    await async_db.refresh(other)
    lesson = await async_db.get(Lesson, s["lesson_ids"][0])
    foreign = Lesson(
        teacher_subject_id=lesson.teacher_subject_id,
        course_id=other.id,
        topic="Begona dars",
        date=date(2026, 10, 9),
    )
    async_db.add(foreign)
    await async_db.commit()
    await async_db.refresh(foreign)

    response = await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[foreign.id]))

    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_new_lesson_question_joins_midterm(auth_client, async_db, midterm_setup):
    """Darsga keyin qo'shilgan savol oraliq nazoratga o'zi tushadi."""
    s = midterm_setup
    l1, l2, _ = s["lesson_ids"]
    quiz = (await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[l1]))).json()
    assert await _linked(async_db, quiz["id"]) == set()

    created = await auth_client.post(
        "/question/",
        json={
            "subject_id": s["subject_id"],
            "user_id": s["teacher_user_id"],
            "lesson_id": l1,
            "text": "Yangi",
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
        },
    )
    other = await auth_client.post(
        "/question/",
        json={
            "subject_id": s["subject_id"],
            "user_id": s["teacher_user_id"],
            "lesson_id": l2,
            "text": "Boshqa dars",
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
        },
    )

    assert created.status_code == 201, created.text
    assert other.status_code == 201, other.text
    assert await _linked(async_db, quiz["id"]) == {created.json()["id"]}


@pytest.mark.asyncio
async def test_extra_question_belongs_only_to_midterm(auth_client, async_db, midterm_setup):
    s = midterm_setup
    l1 = s["lesson_ids"][0]
    q1 = await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l1, text="1")
    quiz = (await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[l1]))).json()

    created = await auth_client.post(
        "/question/",
        json={
            "subject_id": s["subject_id"],
            "user_id": s["teacher_user_id"],
            "quiz_id": quiz["id"],
            # Dars berilsa ham e'tiborga olinmaydi: savol testniki.
            "lesson_id": l1,
            "text": "Qo'shimcha",
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
        },
    )

    assert created.status_code == 201, created.text
    extra_id = created.json()["id"]
    assert created.json()["lesson_id"] is None
    assert await _linked(async_db, quiz["id"]) == {q1, extra_id}

    listed = await auth_client.get("/question/", params={"midterm_quiz_id": quiz["id"]})
    assert listed.status_code == 200, listed.text
    assert [q["id"] for q in listed.json()["questions"]] == [extra_id]

    # Darslar tanlovini o'zgartirish qo'shimcha savolga tegmaydi.
    updated = await auth_client.put(f"/quiz/{quiz['id']}", json=_payload(s, lesson_ids=[]))
    assert updated.status_code == 200, updated.text
    assert updated.json()["lesson_ids"] == []
    assert await _linked(async_db, quiz["id"]) == {extra_id}

    removed = await auth_client.delete(f"/quiz/{quiz['id']}/questions/{extra_id}")
    assert removed.status_code == 204, removed.text
    assert await _linked(async_db, quiz["id"]) == set()
    question = await async_db.get(Question, extra_id)
    assert question.is_active is False


@pytest.mark.asyncio
async def test_extra_question_subject_must_match(auth_client, async_db, midterm_setup, make_subject):
    s = midterm_setup
    quiz = (await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[]))).json()
    other_subject = await make_subject("Boshqa fan")

    created = await auth_client.post(
        "/question/",
        json={
            "subject_id": other_subject.id,
            "user_id": s["teacher_user_id"],
            "quiz_id": quiz["id"],
            "text": "Begona",
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
        },
    )

    assert created.status_code == 422, created.text


@pytest.mark.asyncio
async def test_activation_needs_enough_questions(auth_client, async_db, midterm_setup):
    s = midterm_setup
    l1 = s["lesson_ids"][0]
    await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l1, text="1")

    response = await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[l1], is_active=True))

    assert response.status_code == 409, response.text
    assert response.json()["detail"]["available"] == 1


@pytest.mark.asyncio
async def test_lesson_selection_is_kept(auth_client, async_db, midterm_setup):
    """Savolsiz dars ham tanlovda qoladi."""
    s = midterm_setup
    l1, l2, _ = s["lesson_ids"]
    quiz = (await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[l2, l1]))).json()

    rows = await async_db.execute(select(QuizLesson.lesson_id).where(QuizLesson.quiz_id == quiz["id"]))
    assert set(rows.scalars().all()) == {l1, l2}

    listed = await auth_client.get("/quiz/", params={"course_id": s["course_id"], "quiz_type": "MIDTERM"})
    assert listed.status_code == 200, listed.text
    items = listed.json()["quizzes"]
    assert [q["id"] for q in items] == [quiz["id"]]
    # Dars sanasi bo'yicha tartiblangan.
    assert items[0]["lesson_ids"] == [l1, l2]


@pytest.mark.asyncio
async def test_course_wide_midterm_visible_only_to_course_groups(
    student_client, async_db, make_subject  # noqa: F811
):
    """Guruhsiz oraliq nazorat kurs guruhlariga ko'rinadi, boshqalarga — yo'q."""
    data = student_client
    subject = await make_subject("Oraliq ko'rinish fani")
    course = Course(name="Ko'rinish kursi", subject_id=subject.id, teacher_id=data["user_id"])
    other_course = Course(name="Begona kurs", subject_id=subject.id, teacher_id=data["user_id"])
    async_db.add_all([course, other_course])
    await async_db.commit()
    async_db.add(CourseGroup(course_id=course.id, group_id=data["group_id"]))
    async_db.add(CourseGroup(course_id=other_course.id, group_id=data["other_group_id"]))

    def midterm(course_id: int, pin: str) -> Quiz:
        return Quiz(
            title="Oraliq",
            subject_id=subject.id,
            course_id=course_id,
            group_id=None,
            quiz_type="MIDTERM",
            question_number=1,
            duration=10,
            is_active=True,
            pin=pin,
            proctoring_mode="standard",
        )

    mine, foreign = midterm(course.id, "1001"), midterm(other_course.id, "1002")
    async_db.add_all([mine, foreign])
    await async_db.commit()
    question = Question(
        text="Savol", option_a="a", option_b="b", option_c="c", option_d="d",
        correct_option="a", subject_id=subject.id,
    )
    async_db.add(question)
    await async_db.commit()
    async_db.add_all([
        QuizQuestion(quiz_id=mine.id, question_id=question.id),
        QuizQuestion(quiz_id=foreign.id, question_id=question.id),
    ])
    await async_db.commit()
    mine_id, foreign_id = mine.id, foreign.id
    async_db.expire_all()

    listed = await data["client"].get("/quiz/", params={"limit": 50})
    assert listed.status_code == 200, listed.text
    ids = [q["id"] for q in listed.json()["quizzes"]]
    assert mine_id in ids
    assert foreign_id not in ids

    started = await data["client"].post("/quiz_process/start_quiz", json={"quiz_id": foreign_id, "pin": "1002"})
    assert started.status_code == 403, started.text


async def _bank_question(auth_client, s, control_type: str, text: str):
    """Kursning «Test savollari» ga API orqali savol qo'shadi."""
    return await auth_client.post(
        "/question/",
        json={
            "subject_id": s["subject_id"],
            "user_id": s["teacher_user_id"],
            "course_id": s["course_id"],
            "control_type": control_type,
            "text": text,
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
        },
    )


@pytest.mark.asyncio
async def test_title_comes_from_control_type(auth_client, midterm_setup):
    s = midterm_setup

    created = await auth_client.post("/quiz/", json=_payload(s, control_type="JN2", title="O'zim yozgan nom"))
    assert created.status_code == 201, created.text
    assert created.json()["title"] == "2-joriy nazorat"
    assert created.json()["control_type"] == "JN2"

    # Tur berilmasa, tahrirlash turni ham, nomni ham saqlaydi.
    payload = _payload(s, title="Boshqa nom")
    del payload["control_type"]
    updated = await auth_client.put(f"/quiz/{created.json()['id']}", json=payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()["control_type"] == "JN2"
    assert updated.json()["title"] == "2-joriy nazorat"

    payload = _payload(s)
    del payload["control_type"]
    missing = await auth_client.post("/quiz/", json=payload)
    assert missing.status_code == 422, missing.text


@pytest.mark.asyncio
async def test_bank_questions_of_same_control_join(auth_client, async_db, midterm_setup):
    """«Test savollari» dagi shu turdagi savollar nazoratga o'zi tushadi."""
    s = midterm_setup
    l1 = s["lesson_ids"][0]
    lesson_q = await _add_question(
        async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l1, text="dars"
    )
    on1 = await _add_question(
        async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=None, text="on1",
        course_id=s["course_id"], control_type="ON1",
    )
    on2 = await _add_question(
        async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=None, text="on2",
        course_id=s["course_id"], control_type="ON2",
    )

    # Dars + bank birga yetadi — faollashtirish mumkin.
    created = await auth_client.post("/quiz/", json=_payload(s, lesson_ids=[l1], is_active=True))
    assert created.status_code == 201, created.text
    quiz_id = created.json()["id"]
    assert created.json()["linked_question_count"] == 2
    assert await _linked(async_db, quiz_id) == {lesson_q, on1}

    # Keyin qo'shilgan ON1 savoli tushadi, ON2 — yo'q.
    later = await _bank_question(auth_client, s, "ON1", "keyin")
    other = await _bank_question(auth_client, s, "ON2", "boshqa tur")
    assert later.status_code == 201, later.text
    assert other.status_code == 201, other.text
    assert await _linked(async_db, quiz_id) == {lesson_q, on1, later.json()["id"]}

    # Bank savoli «alohida savollar» ro'yxatida ko'rinmaydi va testdan
    # alohida olib tashlanmaydi — u «Test savollari» da boshqariladi.
    listed = await auth_client.get("/question/", params={"midterm_quiz_id": quiz_id})
    assert listed.status_code == 200, listed.text
    assert listed.json()["questions"] == []
    removed = await auth_client.delete(f"/quiz/{quiz_id}/questions/{on1}")
    assert removed.status_code == 404, removed.text

    # Tur o'zgarsa, savollar yangi turga moslanadi.
    updated = await auth_client.put(f"/quiz/{quiz_id}", json=_payload(s, control_type="ON2", lesson_ids=[l1]))
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "2-oraliq nazorat"
    assert await _linked(async_db, quiz_id) == {lesson_q, on2, other.json()["id"]}


@pytest.mark.asyncio
async def test_lesson_question_counts(auth_client, async_db, midterm_setup):
    s = midterm_setup
    l1, l2, _ = s["lesson_ids"]
    for text in ("1", "2"):
        await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l1, text=text)
    await _add_question(async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l2, text="3")
    hidden = await _add_question(
        async_db, subject_id=s["subject_id"], user_id=s["teacher_user_id"], lesson_id=l2, text="o'chgan"
    )
    question = await async_db.get(Question, hidden)
    question.is_active = False
    await async_db.commit()

    response = await auth_client.get("/question/lesson_counts", params={"course_id": s["course_id"]})

    assert response.status_code == 200, response.text
    assert response.json()["counts"] == {str(l1): 2, str(l2): 1}


@pytest.mark.asyncio
async def test_unanswered_bank_question_can_be_deleted(auth_client, async_db, midterm_setup):
    """Nazoratga avtomatik tushgan «Test savollari» savoli — yechilmagan
    bo'lsa o'chiriladi; yechilgani himoyada qoladi."""
    s = midterm_setup
    quiz = (await auth_client.post("/quiz/", json=_payload(s))).json()
    fresh = (await _bank_question(auth_client, s, "ON1", "yangi")).json()["id"]
    answered = (await _bank_question(auth_client, s, "ON1", "yechilgan")).json()["id"]
    assert await _linked(async_db, quiz["id"]) == {fresh, answered}
    async_db.add(UserAnswers(quiz_id=quiz["id"], question_id=answered, user_id=s["teacher_user_id"]))
    await async_db.commit()

    deleted = await auth_client.delete(f"/question/{fresh}")
    blocked = await auth_client.delete(f"/question/{answered}")

    assert deleted.status_code in (200, 204), deleted.text
    assert blocked.status_code == 409, blocked.text
    assert await _linked(async_db, quiz["id"]) == {answered}
