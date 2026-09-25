"""Talaba dashboardi: raqamlar faqat talabaning oʻzi va guruhidan yigʻiladi.

Sahnada ikkinchi guruh va ikkinchi talaba bor: ularning darsi, vazifasi,
davomati va natijasi ataylab toʻldirilgan — filtr tushib qolsa raqam oshadi.
"""

from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.test.test_student_teacher_scope import _student


async def _login(async_client: AsyncClient, username: str) -> dict:
    response = await async_client.post("/user/login", json={"username": username, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _user(async_db, role, username: str):
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import User, UserRole

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    return user


@pytest_asyncio.fixture
async def student_setup(async_db, test_faculty, make_group, make_subject):
    from app.modules.auth.model import Permission, Role, RolePermission, Teacher, TeacherSubject
    from app.modules.course.model import (
        Course,
        CourseGroup,
        Homework,
        HomeworkSubmission,
        Lesson,
        LessonAttendance,
    )
    from app.modules.quiz.model import Quiz, Result

    role = Role(name="student")
    teacher_role = Role(name="Teacher")
    async_db.add_all([role, teacher_role])
    await async_db.flush()
    permission = Permission(name="student:me")
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    me = await _user(async_db, role, "dash_student")
    classmate = await _user(async_db, role, "dash_classmate")
    teacher_user = await _user(async_db, teacher_role, "dash_st_teacher")
    await async_db.flush()
    teacher = Teacher(user_id=teacher_user.id, last_name="T", first_name="T", third_name="T", full_name="T")
    async_db.add(teacher)

    mine = await make_group("ST-OWN", test_faculty["id"])
    foreign = await make_group("ST-FOREIGN", test_faculty["id"])
    subject = await make_subject("Fizika")
    ts = TeacherSubject(teacher_id=teacher.id, subject_id=subject.id)
    async_db.add(ts)
    await async_db.flush()

    my_course = Course(name="Fizika — ST-OWN", subject_id=subject.id, course_type="lecture", teacher_id=teacher_user.id)
    other_course = Course(name="Fizika — ST-FOREIGN", subject_id=subject.id, course_type="lecture", teacher_id=teacher_user.id)
    async_db.add_all([my_course, other_course])
    await async_db.flush()
    async_db.add_all(
        [
            CourseGroup(course_id=my_course.id, group_id=mine["id"]),
            CourseGroup(course_id=other_course.id, group_id=foreign["id"]),
        ]
    )

    me_student = _student(me.id, mine["id"], "ST-1", "Men")
    mate_student = _student(classmate.id, mine["id"], "ST-2", "Sinfdosh")
    async_db.add_all([me_student, mate_student])
    await async_db.flush()

    today = date.today()
    past = Lesson(teacher_subject_id=ts.id, course_id=my_course.id, group_id=None, topic="Oʻtgan", date=today - timedelta(days=3))
    whole_course = Lesson(teacher_subject_id=ts.id, course_id=my_course.id, group_id=None, topic="Umumiy", date=today + timedelta(days=1))
    other_lesson = Lesson(teacher_subject_id=ts.id, course_id=other_course.id, group_id=None, topic="Begona", date=today + timedelta(days=1))
    async_db.add_all([past, whole_course, other_lesson])
    await async_db.flush()

    async_db.add_all(
        [
            LessonAttendance(lesson_id=past.id, student_id=me_student.id, group_id=mine["id"], status="late"),
            LessonAttendance(lesson_id=past.id, student_id=mate_student.id, group_id=mine["id"], status="absent"),
        ]
    )

    open_hw = Homework(course_id=my_course.id, created_by_user_id=teacher_user.id, title="Ochiq", deadline=utcnow_naive() + timedelta(days=2))
    done_hw = Homework(course_id=my_course.id, created_by_user_id=teacher_user.id, title="Bajarilgan", deadline=utcnow_naive() + timedelta(days=2), max_grade=10)
    missed_hw = Homework(course_id=my_course.id, created_by_user_id=teacher_user.id, title="Oʻtib ketgan", deadline=utcnow_naive() - timedelta(days=2))
    foreign_hw = Homework(course_id=other_course.id, created_by_user_id=teacher_user.id, title="Begona", deadline=utcnow_naive() + timedelta(days=2))
    async_db.add_all([open_hw, done_hw, missed_hw, foreign_hw])
    await async_db.flush()
    async_db.add_all(
        [
            HomeworkSubmission(homework_id=done_hw.id, user_id=me.id, status="graded", grade=8),
            # Qoralama topshirilmagan hisoblanadi.
            HomeworkSubmission(homework_id=open_hw.id, user_id=me.id, status="draft"),
            HomeworkSubmission(homework_id=missed_hw.id, user_id=classmate.id, status="submitted"),
        ]
    )

    quiz = Quiz(lecturer_id=teacher_user.id, group_id=mine["id"], subject_id=subject.id,
                title="Nazorat", question_number=1, duration=10, pin="3333", is_active=True)
    async_db.add(quiz)
    await async_db.flush()
    async_db.add_all(
        [
            Result(quiz_id=quiz.id, group_id=mine["id"], subject_id=subject.id, user_id=me.id, status="completed", grade=4),
            Result(quiz_id=quiz.id, group_id=mine["id"], subject_id=subject.id, user_id=me.id, status="in_progress"),
            Result(quiz_id=quiz.id, group_id=mine["id"], subject_id=subject.id, user_id=classmate.id, status="completed", grade=2),
        ]
    )
    await async_db.commit()

    return {"group_id": mine["id"], "lesson_id": whole_course.id, "open_hw": open_hw.id}


@pytest.mark.asyncio
async def test_student_dashboard_counts_only_own_data(async_client: AsyncClient, student_setup):
    headers = await _login(async_client, "dash_student")
    response = await async_client.get("/students/me/dashboard", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["profile"]["group_name"] == "ST-OWN"

    totals = data["totals"]
    assert totals["courses"] == 1
    assert totals["upcoming_lessons"] == 1
    assert totals["homeworks_pending"] == 1
    assert totals["homeworks_graded"] == 1
    assert totals["homeworks_submitted"] == 0
    assert totals["homeworks_missed"] == 1
    assert totals["quizzes_taken"] == 1

    assert data["attendance"]["late"] == 1
    assert data["attendance"]["absent"] == 0
    assert data["attendance"]["percent"] == 100.0
    [course] = data["attendance"]["courses"]
    assert course["course_name"] == "Fizika — ST-OWN"

    assert data["grades"]["avg_grade"] == 4.0
    assert data["grades"]["grade_4"] == 1
    assert data["grades"]["grade_2"] == 0
    assert data["grades"]["homework_percent"] == 80.0

    assert [lesson["id"] for lesson in data["upcoming_lessons"]] == [student_setup["lesson_id"]]
    assert [hw["id"] for hw in data["homeworks"]] == [student_setup["open_hw"]]
    [result] = data["recent_results"]
    assert result["quiz_title"] == "Nazorat"
    assert result["grade"] == 4


@pytest.mark.asyncio
async def test_student_dashboard_without_student_record(async_client: AsyncClient, async_db):
    from app.modules.auth.model import Permission, Role, RolePermission

    role = Role(name="student")
    permission = Permission(name="student:me")
    async_db.add_all([role, permission])
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await _user(async_db, role, "dash_unlinked")
    await async_db.commit()

    headers = await _login(async_client, "dash_unlinked")
    response = await async_client.get("/students/me/dashboard", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["profile"]["group_id"] is None
    assert data["totals"]["courses"] == 0
    assert data["attendance"]["percent"] is None


@pytest.mark.asyncio
async def test_student_dashboard_requires_permission(async_client: AsyncClient, async_db):
    from app.modules.auth.model import Role

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()
    await _user(async_db, role, "dash_nope")
    await async_db.commit()

    headers = await _login(async_client, "dash_nope")
    response = await async_client.get("/students/me/dashboard", headers=headers)
    assert response.status_code == 403
