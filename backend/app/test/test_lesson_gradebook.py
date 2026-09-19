"""Dars baholash jurnali: talabalar × (uy vazifasi, testlar)."""

from datetime import date, datetime

import pytest
from httpx import AsyncClient


def _student(user_id, group_id, full_name, number):
    from app.modules.auth.model import Student

    return Student(
        user_id=user_id,
        group_id=group_id,
        first_name=full_name,
        last_name="Test",
        third_name="Test",
        full_name=full_name,
        student_id_number=number,
        image_path="",
        birth_date=date(2004, 1, 1),
        phone="",
        gender="male",
        university="NDKTU",
        specialty="Test",
        student_status="active",
        education_form="full_time",
        education_type="bachelor",
        payment_form="grant",
        education_lang="uz",
        faculty="Test",
        level="1",
        semester="1",
        address="Test",
        avg_gpa=0,
    )


@pytest.mark.asyncio
async def test_gradebook_collects_homework_and_quiz_grades(
    auth_client: AsyncClient, async_db, test_kafedra, test_subject, test_teacher, test_group
):
    """Har talaba qatorida: uy vazifasi bahosi va har test bo'yicha oxirgi natija.

    Ish topshirmagan talaba ham jurnalda turadi — aynan shu qatorlar
    o'qituvchiga kim qolganini ko'rsatadi.
    """
    from app.modules.auth.model import Role, TeacherSubject, User
    from app.modules.course.model import Course, CourseGroup, Homework, HomeworkSubmission, Lesson
    from app.modules.quiz.model import Quiz, Result

    course = Course(
        name="Jurnal kursi",
        kafedra_id=test_kafedra["id"],
        subject_id=test_subject.id,
        teacher_id=test_teacher["id"],
    )
    link = TeacherSubject(teacher_id=test_teacher["id"], subject_id=test_subject.id)
    async_db.add_all([course, link])
    await async_db.flush()
    async_db.add(CourseGroup(course_id=course.id, group_id=test_group["id"]))

    lesson = Lesson(course_id=course.id, teacher_subject_id=link.id, topic="1-dars", date=date(2026, 9, 12))
    role = Role(name="Student")
    ali = User(username="ali", password="x", roles=[role])
    vali = User(username="vali", password="x", roles=[role])
    async_db.add_all([lesson, role, ali, vali])
    await async_db.flush()
    async_db.add_all([
        _student(ali.id, test_group["id"], "Aliyev Ali", "GB-1"),
        _student(vali.id, test_group["id"], "Valiyev Vali", "GB-2"),
    ])

    homework = Homework(
        course_id=course.id,
        lesson_id=lesson.id,
        title="1-topshiriq",
        deadline=datetime(2026, 9, 13, 12, 0),
        max_grade=5,
    )
    quiz = Quiz(title="1-test", question_number=5, duration=10, pin="1234", lesson_id=lesson.id)
    async_db.add_all([homework, quiz])
    await async_db.flush()

    # Muddatdan keyin topshirilgan va baholangan ish: «kech» belgisi qolishi kerak.
    async_db.add(
        HomeworkSubmission(
            homework_id=homework.id,
            user_id=ali.id,
            submitted_at=datetime(2026, 9, 14, 9, 0),
            status="graded",
            grade=4,
        )
    )
    async_db.add_all([
        Result(user_id=ali.id, quiz_id=quiz.id, status="completed", grade=3, correct_answers=3, wrong_answers=2),
        Result(user_id=ali.id, quiz_id=quiz.id, status="completed", grade=5, correct_answers=5, wrong_answers=0),
        # Tugallanmagan urinish jurnalga kirmaydi.
        Result(user_id=vali.id, quiz_id=quiz.id, status="in_progress"),
    ])
    await async_db.commit()

    response = await auth_client.get(f"/lesson/{lesson.id}/gradebook")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["homework"]["id"] == homework.id
    assert [q["id"] for q in body["quizzes"]] == [quiz.id]

    rows = {row["full_name"]: row for row in body["students"]}
    assert set(rows) == {"Aliyev Ali", "Valiyev Vali"}

    ali_row = rows["Aliyev Ali"]
    assert ali_row["homework"]["grade"] == 4
    assert ali_row["homework"]["late"] is True
    assert len(ali_row["quizzes"]) == 1
    assert ali_row["quizzes"][0]["grade"] == 5
    assert ali_row["quizzes"][0]["attempts"] == 2

    vali_row = rows["Valiyev Vali"]
    assert vali_row["homework"] is None
    assert vali_row["quizzes"] == []

    # Talaba o'zi ko'radigan ro'yxat: xuddi shu baholar, mavzu bo'yicha.
    from app.modules.course.gradebook.repository import get_gradebook_repository

    mine = await get_gradebook_repository.my_course_grades(async_db, course.id, ali)
    assert [t.topic for t in mine.topics] == ["1-dars"]
    topic = mine.topics[0]
    assert topic.homework.grade == 4 and topic.homework.late is True
    assert topic.quizzes[0].grade == 5 and topic.quizzes[0].attempts == 2

    vali_grades = await get_gradebook_repository.my_course_grades(async_db, course.id, vali)
    assert vali_grades.topics[0].homework.status is None
    assert vali_grades.topics[0].quizzes[0].grade is None
