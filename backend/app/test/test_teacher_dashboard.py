"""Oʻqituvchi dashboardi: raqamlar faqat oʻz doirasidan yigʻiladi.

Sahnada ikki oʻqituvchi bor. Begonasining guruhi, darsi, uy vazifasi va
testi ataylab toʻldirilgan: filtr biror joyda tushib qolsa, raqam oshadi va
test buni koʻradi.
"""

from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.test.test_student_teacher_scope import _student


async def _teacher(async_db, role, username: str):
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Teacher, User, UserRole

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    teacher = Teacher(user_id=user.id, last_name=username, first_name="T", third_name="T", full_name=username)
    async_db.add(teacher)
    await async_db.flush()
    return user, teacher


@pytest_asyncio.fixture
async def dashboard_setup(async_db, test_faculty, make_group, make_subject):
    from app.modules.auth.model import Permission, Role, RolePermission, TeacherSubject
    from app.modules.course.model import (
        Course,
        CourseGroup,
        Homework,
        HomeworkSubmission,
        Lesson,
        LessonAttendance,
    )
    from app.modules.quiz.model import Question, Quiz, Result

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()
    permission = Permission(name="teacher:me")
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    me, my_teacher = await _teacher(async_db, role, "dash_teacher")
    other, other_teacher = await _teacher(async_db, role, "dash_other")

    mine = await make_group("DASH-OWN", test_faculty["id"])
    foreign = await make_group("DASH-FOREIGN", test_faculty["id"])
    subject = await make_subject("Algoritmlar")

    my_ts = TeacherSubject(teacher_id=my_teacher.id, subject_id=subject.id)
    other_ts = TeacherSubject(teacher_id=other_teacher.id, subject_id=subject.id)
    async_db.add_all([my_ts, other_ts])
    await async_db.flush()

    my_course = Course(name="Mening kursim", subject_id=subject.id, course_type="lecture", teacher_id=me.id)
    other_course = Course(name="Begona kurs", subject_id=subject.id, course_type="lecture", teacher_id=other.id)
    async_db.add_all([my_course, other_course])
    await async_db.flush()
    async_db.add_all(
        [
            CourseGroup(course_id=my_course.id, group_id=mine["id"]),
            CourseGroup(course_id=other_course.id, group_id=foreign["id"]),
        ]
    )

    s1 = _student(None, mine["id"], "DASH-1", "Birinchi")
    s2 = _student(None, mine["id"], "DASH-2", "Ikkinchi")
    s3 = _student(None, foreign["id"], "DASH-3", "Begona")
    async_db.add_all([s1, s2, s3])
    await async_db.flush()

    today = date.today()
    past = Lesson(
        teacher_subject_id=my_ts.id, course_id=my_course.id, group_id=mine["id"],
        topic="Oʻtgan dars", date=today - timedelta(days=2),
    )
    future = Lesson(
        teacher_subject_id=my_ts.id, course_id=my_course.id, group_id=mine["id"],
        topic="Keyingi dars", date=today + timedelta(days=3),
    )
    other_lesson = Lesson(
        teacher_subject_id=other_ts.id, course_id=other_course.id, group_id=foreign["id"],
        topic="Begona dars", date=today + timedelta(days=1),
    )
    async_db.add_all([past, future, other_lesson])
    await async_db.flush()

    async_db.add_all(
        [
            LessonAttendance(lesson_id=past.id, student_id=s1.id, group_id=mine["id"], status="present"),
            LessonAttendance(lesson_id=past.id, student_id=s2.id, group_id=mine["id"], status="absent"),
            LessonAttendance(lesson_id=other_lesson.id, student_id=s3.id, group_id=foreign["id"], status="absent"),
        ]
    )

    homework = Homework(
        course_id=my_course.id, created_by_user_id=me.id, title="1-vazifa",
        deadline=utcnow_naive() + timedelta(days=5),
    )
    other_homework = Homework(
        course_id=other_course.id, created_by_user_id=other.id, title="Begona vazifa",
        deadline=utcnow_naive() + timedelta(days=5),
    )
    async_db.add_all([homework, other_homework])
    await async_db.flush()

    from app.modules.auth.model import User

    student_user = User(username="dash_student", password="x", is_active=True)
    async_db.add(student_user)
    await async_db.flush()
    async_db.add_all(
        [
            HomeworkSubmission(homework_id=homework.id, user_id=student_user.id, status="submitted"),
            HomeworkSubmission(homework_id=other_homework.id, user_id=student_user.id, status="submitted"),
        ]
    )

    my_quiz = Quiz(
        lecturer_id=me.id, group_id=mine["id"], subject_id=subject.id,
        title="Mening testim", question_number=1, duration=10, pin="1111", is_active=True,
    )
    other_quiz = Quiz(
        lecturer_id=other.id, group_id=mine["id"], subject_id=subject.id,
        title="Begona test", question_number=1, duration=10, pin="2222", is_active=True,
    )
    async_db.add_all([my_quiz, other_quiz])
    await async_db.flush()
    async_db.add_all(
        [
            Result(quiz_id=my_quiz.id, group_id=mine["id"], subject_id=subject.id, user_id=student_user.id,
                   status="completed", grade=5),
            Result(quiz_id=my_quiz.id, group_id=mine["id"], subject_id=subject.id, user_id=student_user.id,
                   status="completed", grade=3, cheating_detected=True),
            # Tugallanmagan urinish hisobga kirmaydi.
            Result(quiz_id=my_quiz.id, group_id=mine["id"], subject_id=subject.id, user_id=student_user.id,
                   status="in_progress"),
            # Oʻqituvchining guruhida, lekin boshqa oʻqituvchining testi.
            Result(quiz_id=other_quiz.id, group_id=mine["id"], subject_id=subject.id, user_id=student_user.id,
                   status="completed", grade=2),
            Question(subject_id=subject.id, user_id=me.id, text="Q", option_a="A", option_b="B",
                     option_c="C", option_d="D"),
        ]
    )
    await async_db.commit()

    return {"own_group_id": mine["id"], "future_lesson_id": future.id, "homework_id": homework.id}


@pytest_asyncio.fixture
async def dashboard_client(async_client: AsyncClient, dashboard_setup):
    response = await async_client.post("/user/login", json={"username": "dash_teacher", "password": "password123"})
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest.mark.asyncio
async def test_dashboard_counts_only_own_scope(dashboard_client, dashboard_setup):
    response = await dashboard_client.get("/teacher/me/dashboard")
    assert response.status_code == 200, response.text
    data = response.json()

    totals = data["totals"]
    assert totals["courses"] == 1
    assert totals["groups"] == 1
    assert totals["students"] == 2
    assert totals["subjects"] == 1
    assert totals["lessons"] == 2
    assert totals["upcoming_lessons"] == 1
    assert totals["active_homeworks"] == 1
    assert totals["submissions_to_grade"] == 1
    assert totals["quizzes"] == 1
    assert totals["active_quizzes"] == 1
    assert totals["questions"] == 1
    assert totals["results"] == 2

    assert data["attendance"]["present"] == 1
    assert data["attendance"]["absent"] == 1
    assert data["attendance"]["percent"] == 50.0

    assert data["grades"]["avg_grade"] == 4.0
    assert data["grades"]["grade_5"] == 1
    assert data["grades"]["grade_3"] == 1
    assert data["grades"]["grade_2"] == 0
    assert data["grades"]["cheating"] == 1

    [group] = data["groups"]
    assert group["id"] == dashboard_setup["own_group_id"]
    assert group["student_count"] == 2
    assert group["attendance_percent"] == 50.0
    assert group["avg_grade"] == 4.0
    assert group["results"] == 2

    assert [lesson["id"] for lesson in data["upcoming_lessons"]] == [dashboard_setup["future_lesson_id"]]

    [homework] = data["homeworks"]
    assert homework["id"] == dashboard_setup["homework_id"]
    assert homework["to_grade"] == 1
    assert homework["submitted"] == 1

    assert len(data["attendance_trend"]) == 8
    # Oʻtgan dars oxirgi haftalardan biriga tushadi; begona darsning belgisi yoʻq.
    marked = [w for w in data["attendance_trend"] if w["percent"] is not None]
    assert [(w["present"], w["absent"]) for w in marked] == [(1, 1)]


@pytest.mark.asyncio
async def test_dashboard_without_courses_is_empty_not_error(auth_client):
    # Admin: kursi ham, guruhi ham yoʻq — boʻsh roʻyxatlar bilan `IN ()`
    # soʻrovlari yiqilmasligi kerak.
    response = await auth_client.get("/teacher/me/dashboard")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["totals"]["courses"] == 0
    assert data["groups"] == []
    assert data["attendance"]["percent"] is None
    assert data["grades"]["avg_grade"] is None


@pytest.mark.asyncio
async def test_dashboard_requires_teacher_permission(async_client: AsyncClient, async_db):
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Role, User, UserRole

    role = Role(name="student")
    user = User(username="dash_no_perm", password=hash_password("password123"), is_active=True)
    async_db.add_all([role, user])
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.commit()

    login = await async_client.post("/user/login", json={"username": "dash_no_perm", "password": "password123"})
    assert login.status_code == 200
    response = await async_client.get(
        "/teacher/me/dashboard",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert response.status_code == 403
