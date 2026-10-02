"""Kursning «Test savollari» — nazorat turlari boʻyicha (ON1, ON2, JN1, JN2, YN, boshqa).

Oʻqituvchi «Fan topshiriqlari» da savollarni oldindan nazoratlar boʻyicha
toʻplaydi. Savol kursniki boʻladi, darsga bogʻlanmaydi va kursni
boshqaradiganlar (asosiy oʻqituvchi, assistent) bilan cheklanadi.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.modules.course.model import Course, CourseTeacher
from app.modules.quiz.model import Subject


def _question(course_id: int, subject_id: int, control_type: str | None = "ON1", **extra):
    return {
        "subject_id": subject_id,
        "user_id": 0,
        "course_id": course_id,
        "control_type": control_type,
        "text": "Savol",
        "option_a": "a",
        "option_b": "b",
        "option_c": "c",
        "option_d": "d",
        **extra,
    }


@pytest_asyncio.fixture
async def control_course(async_db, test_user, test_kafedra):
    """Admin asosiy oʻqituvchi boʻlgan kurs va «Teacher» rolidagi ikki foydalanuvchi.

    Ulardan biri kursga assistent qilib qoʻshiladi, ikkinchisi — begona.
    Ikkalasiga ham fan biriktirilmagan: kurs savollarini kurs huquqi hal qiladi.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    subject = Subject(name="Nazorat fani", kafedra_id=test_kafedra["id"])
    other_subject = Subject(name="Boshqa fan", kafedra_id=test_kafedra["id"])
    async_db.add_all([subject, other_subject])
    await async_db.flush()

    course = Course(name="Nazorat kursi", subject_id=subject.id, teacher_id=test_user["id"])
    async_db.add(course)
    await async_db.flush()

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()
    for name in ("create:question", "read:question", "update:question", "delete:question"):
        permission = Permission(name=name)
        async_db.add(permission)
        await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    users = {}
    for username in ("ctl_assistant", "ctl_outsider"):
        user = User(username=username, password=hash_password("password123"), is_active=True)
        async_db.add(user)
        await async_db.flush()
        async_db.add(UserRole(user_id=user.id, role_id=role.id))
        users[username] = user.id
    async_db.add(CourseTeacher(course_id=course.id, user_id=users["ctl_assistant"], role="assistant"))
    await async_db.commit()

    return {
        "course_id": course.id,
        "subject_id": subject.id,
        "other_subject_id": other_subject.id,
    }


async def _login_as(client: AsyncClient, username: str) -> AsyncClient:
    response = await client.post("/user/login", json={"username": username, "password": "password123"})
    assert response.status_code == 200, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client


@pytest.mark.asyncio
async def test_questions_are_listed_by_control_type(auth_client, control_course):
    c = control_course
    for kind in ("ON1", "ON1", "JN2", "OTHER"):
        response = await auth_client.post("/question/", json=_question(c["course_id"], c["subject_id"], kind))
        assert response.status_code == 201, response.text
        assert response.json()["course_id"] == c["course_id"]
        assert response.json()["control_type"] == kind
        assert response.json()["lesson_id"] is None

    on1 = await auth_client.get("/question/", params={"course_id": c["course_id"], "control_type": "ON1"})
    assert on1.status_code == 200
    assert on1.json()["total"] == 2
    assert {q["control_type"] for q in on1.json()["questions"]} == {"ON1"}

    counts = await auth_client.get("/question/control_counts", params={"course_id": c["course_id"]})
    assert counts.status_code == 200, counts.text
    assert counts.json()["counts"] == {"ON1": 2, "ON2": 0, "JN1": 0, "JN2": 1, "YN": 0, "OTHER": 1}


@pytest.mark.asyncio
async def test_edit_keeps_question_in_its_control(auth_client, test_user, control_course):
    """Tahrirlash yangi versiya yaratadi — u ham oʻsha boʻlimda qolishi kerak.

    Savol formasi tahrirlashda kurs va nazoratni yubormaydi.
    """
    c = control_course
    created = await auth_client.post("/question/", json=_question(c["course_id"], c["subject_id"], "YN"))
    question_id = created.json()["id"]

    update = {**_question(c["course_id"], c["subject_id"]), "text": "Yangilangan", "user_id": test_user["id"]}
    update.pop("course_id")
    update.pop("control_type")
    response = await auth_client.put(f"/question/{question_id}", json=update)
    assert response.status_code == 200, response.text
    assert response.json()["course_id"] == c["course_id"]
    assert response.json()["control_type"] == "YN"

    listed = await auth_client.get("/question/", params={"course_id": c["course_id"], "control_type": "YN"})
    assert [q["text"] for q in listed.json()["questions"]] == ["Yangilangan"]


@pytest.mark.asyncio
async def test_subject_must_match_the_course(auth_client, control_course):
    c = control_course
    response = await auth_client.post("/question/", json=_question(c["course_id"], c["other_subject_id"]))
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_course_and_control_type_come_together(auth_client, control_course):
    c = control_course
    response = await auth_client.post("/question/", json=_question(c["course_id"], c["subject_id"], None))
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_assistant_without_subject_can_add_and_see(async_client, auth_client, control_course):
    c = control_course
    # Asosiy oʻqituvchi (admin) yozgan savol assistentga ham koʻrinadi.
    await auth_client.post("/question/", json=_question(c["course_id"], c["subject_id"], "JN1"))

    client = await _login_as(async_client, "ctl_assistant")
    created = await client.post("/question/", json=_question(c["course_id"], c["subject_id"], "JN1"))
    assert created.status_code == 201, created.text

    listed = await client.get("/question/", params={"course_id": c["course_id"], "control_type": "JN1"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 2


@pytest.mark.asyncio
async def test_outsider_is_rejected(async_client, auth_client, control_course):
    c = control_course
    client = await _login_as(async_client, "ctl_outsider")

    created = await client.post("/question/", json=_question(c["course_id"], c["subject_id"]))
    assert created.status_code == 403, created.text

    listed = await client.get("/question/", params={"course_id": c["course_id"], "control_type": "ON1"})
    assert listed.status_code == 403

    counts = await client.get("/question/control_counts", params={"course_id": c["course_id"]})
    assert counts.status_code == 403
