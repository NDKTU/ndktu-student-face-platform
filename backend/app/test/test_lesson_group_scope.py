"""Guruhsiz dars talabaga koʻrinadimi.

``lessons.group_id`` boʻsh boʻlsa dars kursning barcha guruhlariniki. Talaba
darslarni oʻz guruhi boʻyicha koʻradi, shuning uchun bu shart alohida
tekshiriladi: filtr faqat ``group_id == talabaning guruhi`` boʻlib qolsa,
guruhsiz darslar hech kimga koʻrinmasdi.
"""

from datetime import date

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def course_with_two_groups(auth_client, test_teacher, test_subject, test_faculty, test_kafedra):
    first = await auth_client.post("/group/", json={"name": "LS-101", "faculty_id": test_faculty["id"]})
    second = await auth_client.post("/group/", json={"name": "LS-102", "faculty_id": test_faculty["id"]})
    assert first.status_code == 201 and second.status_code == 201

    course = await auth_client.post(
        "/course/",
        json={
            "name": "Oqim kursi",
            "subject_id": test_subject.id,
            "teacher_id": test_teacher["user_id"],
            "group_ids": [first.json()["id"], second.json()["id"]],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course.status_code == 201

    shared = await auth_client.post(
        "/lesson/",
        json={"course_id": course.json()["id"], "topic": "Hamma uchun", "date": "2026-08-21"},
    )
    assert shared.status_code == 201

    only_second = await auth_client.post(
        "/lesson/",
        json={
            "course_id": course.json()["id"],
            "group_id": second.json()["id"],
            "topic": "Faqat LS-102 uchun",
            "date": "2026-08-21",
        },
    )
    assert only_second.status_code == 201

    return {
        "course_id": course.json()["id"],
        "first_group_id": first.json()["id"],
        "second_group_id": second.json()["id"],
    }


@pytest_asyncio.fixture
async def student_client(async_client, async_db, auth_client, course_with_two_groups, test_role):
    """Birinchi guruhning talabasi sifatida kirgan mijoz.

    Roli aynan Student boʻlishi shart: admin darslar filtrini butunlay
    chetlab oʻtadi va tekshiruv maʼnosini yoʻqotardi.
    """
    from app.modules.auth.model import Permission, Role, RolePermission, Student

    role = Role(name="Student")
    async_db.add(role)
    await async_db.flush()
    permission = Permission(name="read:lesson")
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await async_db.commit()

    created = await auth_client.post(
        "/user/",
        json={"username": "lesson_scope_student", "password": "password123", "roles": [{"name": "Student"}]},
    )
    assert created.status_code == 201

    async_db.add(
        Student(
            user_id=created.json()["id"],
            group_id=course_with_two_groups["first_group_id"],
            first_name="Test",
            last_name="Student",
            third_name="T",
            full_name="Test Student T",
            student_id_number="777777",
            image_path="path/to/img",
            birth_date=date(2000, 1, 1),
            phone="123456789",
            gender="M",
            university="Test Uni",
            specialty="CS",
            student_status="Active",
            education_form="Day",
            education_type="Bachelor",
            payment_form="Contract",
            education_lang="En",
            faculty="IT",
            level="1",
            semester="1",
            address="Test Addr",
            avg_gpa=4.5,
        )
    )
    await async_db.commit()

    login = await async_client.post("/user/login", json={"username": "lesson_scope_student", "password": "password123"})
    assert login.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    return async_client


@pytest.mark.asyncio
async def test_student_sees_the_course_wide_lesson(student_client):
    """Guruhsiz dars oʻz guruhi kursda boʻlgan talabaga yetib boradi."""
    response = await student_client.get("/lesson/")
    assert response.status_code == 200

    topics = {lesson["topic"] for lesson in response.json()["lessons"]}
    assert "Hamma uchun" in topics


@pytest.mark.asyncio
async def test_student_does_not_see_another_groups_lesson(student_client):
    """Guruh koʻrsatilgan dars faqat oʻsha guruhga koʻrinadi.

    Guruhni tanlash imkoni ataylab qolgan — bir guruhga alohida dars kerak
    boʻlganda uni qolganlaridan yashirish shu tekshiruvga tayanadi.
    """
    response = await student_client.get("/lesson/")
    topics = {lesson["topic"] for lesson in response.json()["lessons"]}

    assert "Faqat LS-102 uchun" not in topics


@pytest.mark.asyncio
async def test_group_filter_keeps_course_wide_lessons(auth_client, course_with_two_groups):
    """Guruh boʻyicha filtr umumiy darsni ham qaytaradi.

    Aks holda oʻqituvchi guruhni tanlaganda dars roʻyxati boʻshab qolardi.
    """
    response = await auth_client.get(f"/lesson/?group_id={course_with_two_groups['first_group_id']}")
    assert response.status_code == 200

    topics = {lesson["topic"] for lesson in response.json()["lessons"]}
    assert topics == {"Hamma uchun"}
