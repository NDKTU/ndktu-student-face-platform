"""Dars testlarining qisqa yakuni.

Oʻqituvchi test oʻtkazgach natijani darhol koʻrishi kerak: nechta
talaba topshirdi va oʻrtacha baho qancha. Ilgari buning uchun umumiy
«Testlar» boʻlimidan kerakli testni qidirib topish kerak edi.

Maxraj — testning GURUHLARIDAGI talabalar soni: «24 tadan 12 tasi»
kim qolganini ham koʻrsatadi, «12 ta topshirdi» esa yoʻq.
"""

from datetime import date

import pytest
import pytest_asyncio

from app.modules.auth.model import Student, TeacherSubject
from app.modules.course.model import Course, CourseGroup, Lesson
from app.modules.quiz.model import Quiz, Result


@pytest_asyncio.fixture
async def lesson_with_groups(async_db, make_teacher, make_subject, make_group, test_faculty, test_kafedra):
    """Kurs, ikkita guruh va GURUHSIZ dars (kursning hammasiga tegishli)."""
    teacher = await make_teacher("summary_teacher", test_kafedra["id"])
    subject = await make_subject("Yakun fani")
    first = await make_group("SUM-1", test_faculty["id"])
    second = await make_group("SUM-2", test_faculty["id"])
    link = TeacherSubject(teacher_id=teacher["id"], subject_id=subject.id)
    async_db.add(link)
    await async_db.commit()
    await async_db.refresh(link)

    course = Course(name="Yakun kursi", subject_id=subject.id, teacher_id=teacher["user_id"])
    async_db.add(course)
    await async_db.commit()
    await async_db.refresh(course)
    async_db.add_all([
        CourseGroup(course_id=course.id, group_id=first["id"]),
        CourseGroup(course_id=course.id, group_id=second["id"]),
    ])

    lesson = Lesson(
        teacher_subject_id=link.id,
        group_id=None,
        course_id=course.id,
        topic="Yakun mavzusi",
        date=date(2026, 10, 2),
    )
    async_db.add(lesson)
    await async_db.commit()
    await async_db.refresh(lesson)

    return {
        "lesson_id": lesson.id,
        "subject_id": subject.id,
        "lecturer_id": teacher["user_id"],
        "groups": [first["id"], second["id"]],
    }


async def _add_student(async_db, *, group_id: int, number: str) -> int:
    student = Student(
        group_id=group_id,
        first_name="Talaba",
        last_name=number,
        third_name="T",
        full_name=f"Talaba {number}",
        student_id_number=number,
        image_path="students/x.jpg",
        birth_date=date(2005, 1, 1),
        gender="male",
        university="NDKTU",
        specialty="X",
        student_status="active",
        education_form="Kunduzgi",
        education_type="Bakalavr",
        payment_form="Kontrakt",
        education_lang="uz",
        faculty="X",
        level="1-kurs",
        semester="1",
        address="Navoiy",
        avg_gpa=0.0,
    )
    async_db.add(student)
    await async_db.commit()
    await async_db.refresh(student)
    return student.id


async def _add_quiz(async_db, *, lesson_id: int, subject_id: int, lecturer_id: int, pin: str, group_id=None):
    quiz = Quiz(
        title=f"Test {pin}",
        subject_id=subject_id,
        group_id=group_id,
        lesson_id=lesson_id,
        question_number=1,
        duration=10,
        is_active=True,
        pin=pin,
        proctoring_mode="standard",
        lecturer_id=lecturer_id,
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)
    return quiz.id


@pytest.mark.asyncio
async def test_summary_counts_submissions_and_average(auth_client, async_db, lesson_with_groups, test_user):
    """Topshirganlar soni va oʻrtacha baho."""
    data = lesson_with_groups
    await _add_student(async_db, group_id=data["groups"][0], number="S001")
    await _add_student(async_db, group_id=data["groups"][1], number="S002")

    quiz_id = await _add_quiz(
        async_db,
        lesson_id=data["lesson_id"],
        subject_id=data["subject_id"],
        lecturer_id=data["lecturer_id"],
        pin="9001",
    )
    # Bitta talaba yakunladi, ikkinchisi — yoʻq.
    async_db.add(
        Result(
            user_id=test_user["id"],
            quiz_id=quiz_id,
            subject_id=data["subject_id"],
            status="completed",
            grade=4,
            correct_answers=4,
            wrong_answers=1,
        )
    )
    await async_db.commit()
    async_db.expire_all()

    response = await auth_client.get(f"/quiz/lesson/{data['lesson_id']}/summary")

    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["quiz_id"] == quiz_id
    assert item["submitted_count"] == 1
    # Dars guruhsiz — maxraj kursning IKKALA guruhidagi talabalar.
    assert item["total_students"] == 2
    assert item["average_grade"] == 4.0


@pytest.mark.asyncio
async def test_unfinished_attempts_are_not_counted(auth_client, async_db, lesson_with_groups, test_user):
    """Yakunlanmagan urinish topshirilgan deb sanalmaydi.

    Aks holda oʻqituvchi «hamma topshirdi» deb oʻylab, testni yopib
    qoʻyardi — aslida yarmi hali ishlayotgan boʻlardi.
    """
    data = lesson_with_groups
    await _add_student(async_db, group_id=data["groups"][0], number="S003")
    quiz_id = await _add_quiz(
        async_db,
        lesson_id=data["lesson_id"],
        subject_id=data["subject_id"],
        lecturer_id=data["lecturer_id"],
        pin="9002",
    )
    async_db.add(
        Result(
            user_id=test_user["id"],
            quiz_id=quiz_id,
            subject_id=data["subject_id"],
            status="in_progress",
            correct_answers=0,
            wrong_answers=0,
        )
    )
    await async_db.commit()
    async_db.expire_all()

    response = await auth_client.get(f"/quiz/lesson/{data['lesson_id']}/summary")

    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["submitted_count"] == 0
    assert item["average_grade"] is None


@pytest.mark.asyncio
async def test_quiz_with_own_group_uses_that_group(auth_client, async_db, lesson_with_groups):
    """Testda guruh koʻrsatilgan boʻlsa — maxraj oʻsha guruh.

    Kursda ikkita guruh boʻlsa ham, bitta guruhga moʻljallangan test
    uchun «24 tadan» emas, «12 tadan» deb koʻrsatish kerak.
    """
    data = lesson_with_groups
    await _add_student(async_db, group_id=data["groups"][0], number="S004")
    await _add_student(async_db, group_id=data["groups"][1], number="S005")
    await _add_student(async_db, group_id=data["groups"][1], number="S006")

    quiz_id = await _add_quiz(
        async_db,
        lesson_id=data["lesson_id"],
        subject_id=data["subject_id"],
        lecturer_id=data["lecturer_id"],
        pin="9003",
        group_id=data["groups"][1],
    )
    async_db.expire_all()

    response = await auth_client.get(f"/quiz/lesson/{data['lesson_id']}/summary")

    assert response.status_code == 200, response.text
    item = next(i for i in response.json()["items"] if i["quiz_id"] == quiz_id)
    assert item["total_students"] == 2, "faqat ikkinchi guruh sanaladi"


@pytest.mark.asyncio
async def test_lesson_without_quizzes_returns_empty(auth_client, lesson_with_groups):
    response = await auth_client.get(f"/quiz/lesson/{lesson_with_groups['lesson_id']}/summary")

    assert response.status_code == 200, response.text
    assert response.json()["items"] == []
