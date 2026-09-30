"""Kurslar statistikasi: har kursda nechta mavzu, resurs va topshiriq.

Sanoqlar uch xil jadvaldan keladi va aynan shu yerda xato qilish oson:
ularni kursga bitta JOIN bilan ulasak, har biri boshqalariga ko'paytirilib
chiqadi. Resurs esa ikki joyda yashaydi — dars materiali (`lesson_id`) va
kurs kutubxonasi (`course_id`), ikkalasi ham kursniki.
"""

from datetime import date, datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select


@pytest_asyncio.fixture
async def stats_courses(async_db, test_teacher, test_kafedra, test_group):
    """Ikki kurs: to'ldirilgani (2 mavzu, 3 resurs, 1 topshiriq) va bo'shi."""
    from app.modules.auth.model import TeacherSubject
    from app.modules.course.model import Course, CourseGroup, Homework, Lesson, Resource
    from app.modules.organization_structure.model import Group
    from app.modules.quiz.model import Subject

    # 4-kurs guruhi: kuzgi semestr — 7-semestr.
    group = (await async_db.execute(select(Group).where(Group.id == test_group["id"]))).scalar_one()
    group.course = 4
    group.education_shape = "kunduzgi"

    filled_subject = Subject(name="AutoCAD asoslari", kafedra_id=test_kafedra["id"])
    empty_subject = Subject(name="Bo'sh fan", kafedra_id=test_kafedra["id"])
    async_db.add_all([filled_subject, empty_subject])
    await async_db.flush()

    filled = Course(
        name="AutoCAD asoslari — SE-2023 (ma'ruza, kuzgi semestr)",
        subject_id=filled_subject.id,
        teacher_id=test_teacher["user_id"],
        kafedra_id=test_kafedra["id"],
        course_type="lecture",
        semester_number=1,
    )
    empty = Course(
        name="Bo'sh fan (amaliyot, bahorgi semestr)",
        subject_id=empty_subject.id,
        teacher_id=test_teacher["user_id"],
        kafedra_id=test_kafedra["id"],
        course_type="practice",
        semester_number=2,
    )
    link = TeacherSubject(teacher_id=test_teacher["id"], subject_id=filled_subject.id)
    async_db.add_all([filled, empty, link])
    await async_db.flush()
    async_db.add(CourseGroup(course_id=filled.id, group_id=test_group["id"]))

    first = Lesson(course_id=filled.id, teacher_subject_id=link.id, topic="1-mavzu", date=date(2026, 9, 1))
    second = Lesson(course_id=filled.id, teacher_subject_id=link.id, topic="2-mavzu", date=date(2026, 9, 8))
    async_db.add_all([first, second])
    await async_db.flush()

    async_db.add_all([
        # Dars materiallari — faqat `lesson_id` bilan, xuddi ilovadagidek.
        Resource(lesson_id=first.id, resource_type="link", title="Ma'ruza matni", link_url="https://x"),
        Resource(lesson_id=second.id, resource_type="link", title="Taqdimot", link_url="https://x"),
        # Kurs kutubxonasi — faqat `course_id` bilan.
        Resource(course_id=filled.id, resource_type="link", title="Dastur", link_url="https://x"),
        Homework(
            course_id=filled.id,
            lesson_id=first.id,
            title="1-topshiriq",
            deadline=datetime(2026, 9, 15, 12, 0),
        ),
    ])
    await async_db.commit()
    return {"filled": filled.id, "empty": empty.id}


async def _stats(client: AsyncClient, **params) -> dict:
    response = await client.get("/course/stats", params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_counts_topics_resources_and_homeworks(auth_client, stats_courses):
    body = await _stats(auth_client)
    rows = {row["course_id"]: row for row in body["rows"]}

    filled = rows[stats_courses["filled"]]
    # Uchta sanoq birga: JOIN'lar ko'paytirganda 2 mavzu × 3 resurs 6 ga
    # aylanardi.
    assert (filled["topic_count"], filled["resource_count"], filled["homework_count"]) == (2, 3, 1)

    empty = rows[stats_courses["empty"]]
    assert (empty["topic_count"], empty["resource_count"], empty["homework_count"]) == (0, 0, 0)

    assert body["summary"] == {
        "course_count": 2,
        "topic_count": 2,
        "resource_count": 3,
        "homework_count": 1,
        "empty_course_count": 1,
    }


@pytest.mark.asyncio
async def test_row_columns(auth_client, stats_courses, test_kafedra, test_faculty):
    body = await _stats(auth_client)
    row = next(r for r in body["rows"] if r["course_id"] == stats_courses["filled"])

    assert row["kafedra_name"] == test_kafedra["name"]
    # «Bo'lim» — kafedraning fakulteti.
    assert row["faculty_name"] == test_faculty["name"]
    assert row["subject_name"] == "AutoCAD asoslari"
    assert row["course_type"] == "lecture"
    # Rejasiz kursda shakl guruhdan olinadi.
    assert row["education_form"] == "kunduzgi"
    # 4-kurs, kuzgi → 7-semestr.
    assert row["study_semester"] == 7


@pytest.mark.asyncio
async def test_course_without_groups_has_no_study_semester(auth_client, stats_courses):
    """Guruhsiz kursda o'qish yili noma'lum — semestrni o'ylab topmaymiz."""
    body = await _stats(auth_client)
    row = next(r for r in body["rows"] if r["course_id"] == stats_courses["empty"])

    assert row["study_semester"] is None
    assert row["semester_number"] == 2


@pytest.mark.asyncio
async def test_fill_filter(auth_client, stats_courses):
    empty = await _stats(auth_client, fill="empty")
    filled = await _stats(auth_client, fill="filled")

    assert [r["course_id"] for r in empty["rows"]] == [stats_courses["empty"]]
    assert [r["course_id"] for r in filled["rows"]] == [stats_courses["filled"]]
    # Umumiy sonlar ham filtr bo'yicha — sahifa emas, butun tanlov.
    assert empty["summary"]["course_count"] == 1
    assert filled["summary"]["topic_count"] == 2


@pytest.mark.asyncio
async def test_semester_filter(auth_client, stats_courses):
    assert [r["course_id"] for r in (await _stats(auth_client, semester=7))["rows"]] == [stats_courses["filled"]]
    assert (await _stats(auth_client, semester=8))["rows"] == []


@pytest.mark.asyncio
async def test_sort_by_topics(auth_client, stats_courses):
    rows = (await _stats(auth_client, sort_by="topics", order="desc"))["rows"]
    assert [r["course_id"] for r in rows] == [stats_courses["filled"], stats_courses["empty"]]


@pytest.mark.asyncio
async def test_archived_courses_are_excluded(auth_client, async_db, stats_courses):
    from app.modules.course.model import Course

    course = (await async_db.execute(select(Course).where(Course.id == stats_courses["empty"]))).scalar_one()
    course.is_active = False
    await async_db.commit()

    body = await _stats(auth_client)
    assert [r["course_id"] for r in body["rows"]] == [stats_courses["filled"]]
    assert body["summary"]["empty_course_count"] == 0


@pytest.mark.asyncio
async def test_teacher_cannot_read_stats(async_client: AsyncClient, async_db, auth_client, stats_courses):
    """`read:course` yetmaydi: statistika — butun universitet kesimi."""
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()
    for name in ("read:course", "read:course_stats"):
        async_db.add(Permission(name=name))
    await async_db.flush()
    read_course = (await async_db.execute(select(Permission).where(Permission.name == "read:course"))).scalar_one()
    async_db.add(RolePermission(role_id=role.id, permission_id=read_course.id))

    teacher = User(username="stats_teacher", password=hash_password("password123"), is_active=True)
    async_db.add(teacher)
    await async_db.flush()
    async_db.add(UserRole(user_id=teacher.id, role_id=role.id))
    await async_db.commit()

    response = await async_client.post("/user/login", json={"username": "stats_teacher", "password": "password123"})
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"

    # Kurslar ro'yxati ochiladi — ya'ni 403 login yoki rol muammosidan emas.
    assert (await async_client.get("/course/")).status_code == 200
    assert (await async_client.get("/course/stats")).status_code == 403
