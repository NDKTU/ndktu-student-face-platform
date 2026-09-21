"""Oʻqituvchi qaysi talabalarni koʻradi.

Qoida: **oʻzi dars oʻtadigan guruhlarning talabalari**. Ilgari `read:student`
bor foydalanuvchi universitetning barcha talabalarini koʻrardi, ruxsat esa
baʼzi oʻqituvchilarda bor (qoʻlda berilgan yoki eski migratsiyadan qolgan) va
uni roldan olib tashlash bilan hal qilib boʻlmaydi: seed ruxsat OLIB
TASHLAMAYDI (`core/lifespan/defaults.py`). Shuning uchun chegara soʻrovning
oʻzida — `StudentRepository.visible_group_ids`.

Guruhlar ikki manbadan yigʻiladi (`core/utils/group_scope.py`): admin
biriktirgani (`teacher_group`) va oʻqituvchining kurslariga biriktirilgani.
Shu yerda ikkalasi ham tekshiriladi.
"""

from datetime import date

import pytest
import pytest_asyncio
from httpx import AsyncClient


def _student(user_id: int | None, group_id: int, number: str, name: str):
    from app.modules.auth.model import Student

    return Student(
        user_id=user_id,
        group_id=group_id,
        first_name=name,
        last_name="Talaba",
        third_name="T",
        full_name=f"{name} Talaba T",
        student_id_number=number,
        image_path="",
        birth_date=date(2000, 1, 1),
        phone="998900000000",
        gender="M",
        university="NDKTU",
        specialty="Dasturiy injiniring",
        student_status="Active",
        education_form="Kunduzgi",
        education_type="Bakalavr",
        payment_form="Shartnoma",
        education_lang="Oʻzbek",
        faculty="IT",
        level="1",
        semester="1",
        address="Navoiy",
        avg_gpa=4.0,
    )


@pytest_asyncio.fixture
async def scope_setup(async_db, auth_client, test_faculty, make_group, make_subject):
    """Ikkita guruh: biri oʻqituvchiniki, ikkinchisi begona.

    Oʻqituvchining guruhi ataylab KURS orqali bogʻlanadi — `teacher_group`
    satri yozilmaydi. Faqat biriktirmaga tayanadigan filtr bu holatda boʻsh
    roʻyxat berardi.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, Teacher, User, UserRole
    from app.modules.course.model import Course, CourseGroup

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()

    # Test bazasi boʻsh koʻtariladi: ruxsatlarsiz soʻrov 403 qaytaradi va
    # test "toʻgʻri sabab bilan emas" oʻtib ketardi.
    for name in ("read:student", "read:group"):
        permission = Permission(name=name)
        async_db.add(permission)
        await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(username="scope_teacher", password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))

    teacher = Teacher(
        user_id=user.id,
        last_name="Oʻqituvchi",
        first_name="Test",
        third_name="T",
        full_name="Oʻqituvchi Test T",
    )
    async_db.add(teacher)
    await async_db.flush()

    mine = await make_group("SCOPE-OWN", test_faculty["id"])
    foreign = await make_group("SCOPE-FOREIGN", test_faculty["id"])

    subject = await make_subject("Ma'lumotlar tuzilmasi")
    course = Course(
        name="Scope kursi",
        subject_id=subject.id,
        course_type="lecture",
        teacher_id=user.id,
    )
    async_db.add(course)
    await async_db.flush()
    async_db.add(CourseGroup(course_id=course.id, group_id=mine["id"]))

    own_student = _student(None, mine["id"], "SCOPE-1", "Oʻz")
    foreign_student = _student(None, foreign["id"], "SCOPE-2", "Begona")
    async_db.add_all([own_student, foreign_student])
    await async_db.commit()
    await async_db.refresh(own_student)
    await async_db.refresh(foreign_student)

    return {
        "username": "scope_teacher",
        "password": "password123",
        "teacher_id": teacher.id,
        "own_group_id": mine["id"],
        "foreign_group_id": foreign["id"],
        "own_student_id": own_student.id,
        "foreign_student_id": foreign_student.id,
    }


@pytest_asyncio.fixture
async def teacher_client(async_client: AsyncClient, scope_setup):
    response = await async_client.post(
        "/user/login",
        json={"username": scope_setup["username"], "password": scope_setup["password"]},
    )
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest.mark.asyncio
async def test_teacher_sees_only_their_own_students(teacher_client, scope_setup):
    response = await teacher_client.get("/students/")
    assert response.status_code == 200

    data = response.json()
    ids = [student["id"] for student in data["students"]]
    assert ids == [scope_setup["own_student_id"]]
    # Jami ham cheklanishi shart: aks holda sahifalagich boʻsh sahifalar
    # chizardi va «860 ta talaba» degan yolgʻon raqam koʻrinardi.
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_teacher_cannot_open_a_foreign_student_by_id(teacher_client, scope_setup):
    """Roʻyxatda yoʻq talaba id boʻyicha ham ochilmaydi.

    404, 403 emas: begona talabaning bor-yoʻqligi id bo'yicha bilinmasin.
    """
    response = await teacher_client.get(f"/students/{scope_setup['foreign_student_id']}")
    assert response.status_code == 404

    own = await teacher_client.get(f"/students/{scope_setup['own_student_id']}")
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_teacher_cannot_list_a_foreign_group(teacher_client, scope_setup):
    """`read:student` begona guruhni ochishga asos boʻlmaydi."""
    response = await teacher_client.get(f"/group/{scope_setup['foreign_group_id']}/students")
    assert response.status_code == 403

    own = await teacher_client.get(f"/group/{scope_setup['own_group_id']}/students")
    assert own.status_code == 200
    assert [s["id"] for s in own.json()["students"]] == [scope_setup["own_student_id"]]


@pytest.mark.asyncio
async def test_admin_still_sees_every_student(auth_client, scope_setup):
    """Admin uchun hech nima oʻzgarmadi."""
    response = await auth_client.get("/students/")
    assert response.status_code == 200

    ids = [student["id"] for student in response.json()["students"]]
    assert scope_setup["own_student_id"] in ids
    assert scope_setup["foreign_student_id"] in ids
