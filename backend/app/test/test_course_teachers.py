"""Kursda bir nechta oʻqituvchi: asosiy va assistent.

Qoida ikki darajali. Assistent kundalik ishni qila oladi — dars, material,
mavzu, uy vazifasi, baholash. Kursning oʻzi ustidan qaror esa asosiy
oʻqituvchida qoladi: oʻchirish va oʻqituvchilar roʻyxatini oʻzgartirish.
Aks holda «asosiy» soʻzining maʼnosi qolmasdi.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest_asyncio.fixture
async def course_with_assistant(async_db, auth_client, test_user, test_kafedra, test_group):
    """Kurs, uning asosiy oʻqituvchisi (admin) va bitta assistent."""
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole
    from app.modules.quiz.model import Subject

    subject = Subject(name="Fizika", kafedra_id=test_kafedra["id"])
    async_db.add(subject)
    await async_db.flush()

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()

    for name in ("read:course", "update:course", "create:resource", "read:resource"):
        permission = Permission(name=name)
        async_db.add(permission)
        await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    assistant = User(
        username="course_assistant",
        password=hash_password("password123"),
        is_active=True,
    )
    async_db.add(assistant)
    await async_db.flush()
    async_db.add(UserRole(user_id=assistant.id, role_id=role.id))
    await async_db.commit()

    response = await auth_client.post(
        "/course/",
        json={
            "subject_id": subject.id,
            "teacher_id": test_user["id"],
            "semester_number": 1,
            "group_ids": [test_group["id"]],
        },
    )
    assert response.status_code == 201

    return {
        "course_id": response.json()["id"],
        "main_user_id": test_user["id"],
        "assistant_id": assistant.id,
    }


@pytest.mark.asyncio
async def test_main_teacher_is_recorded_on_creation(auth_client, course_with_assistant):
    """Asosiy oʻqituvchi roʻyxatga ham tushadi.

    Usiz «kursning oʻqituvchilari» degan savolga ikki manbadan javob berishga
    toʻgʻri kelardi.
    """
    response = await auth_client.get(f"/course/{course_with_assistant['course_id']}/teachers")
    assert response.status_code == 200

    teachers = response.json()["teachers"]
    assert len(teachers) == 1
    assert teachers[0]["user_id"] == course_with_assistant["main_user_id"]
    assert teachers[0]["role"] == "main"


@pytest.mark.asyncio
async def test_assistant_can_be_added_and_removed(auth_client, course_with_assistant):
    course_id = course_with_assistant["course_id"]

    added = await auth_client.post(
        f"/course/{course_id}/teachers",
        json={"user_id": course_with_assistant["assistant_id"]},
    )
    assert added.status_code == 200
    roles = {t["user_id"]: t["role"] for t in added.json()["teachers"]}
    assert roles[course_with_assistant["assistant_id"]] == "assistant"

    removed = await auth_client.delete(
        f"/course/{course_id}/teachers/{course_with_assistant['assistant_id']}"
    )
    assert removed.status_code == 204

    after = await auth_client.get(f"/course/{course_id}/teachers")
    assert len(after.json()["teachers"]) == 1


@pytest.mark.asyncio
async def test_adding_the_same_assistant_twice_is_harmless(auth_client, course_with_assistant):
    course_id = course_with_assistant["course_id"]
    payload = {"user_id": course_with_assistant["assistant_id"]}

    await auth_client.post(f"/course/{course_id}/teachers", json=payload)
    second = await auth_client.post(f"/course/{course_id}/teachers", json=payload)

    assert second.status_code == 200
    assert len(second.json()["teachers"]) == 2


@pytest.mark.asyncio
async def test_main_teacher_cannot_be_removed(auth_client, course_with_assistant):
    """Kursni egasiz qoldirib boʻlmaydi."""
    response = await auth_client.delete(
        f"/course/{course_with_assistant['course_id']}"
        f"/teachers/{course_with_assistant['main_user_id']}"
    )
    assert response.status_code == 409


@pytest_asyncio.fixture
async def assistant_client(async_client: AsyncClient, auth_client, course_with_assistant):
    """Assistent sifatida kirgan mijoz.

    Assistent avval qoʻshiladi (admin nomidan), keyin login qilinadi —
    fixture'lar bitta mijoz obyektini oʻzgartirgani uchun tartib muhim.
    """
    await auth_client.post(
        f"/course/{course_with_assistant['course_id']}/teachers",
        json={"user_id": course_with_assistant["assistant_id"]},
    )

    response = await async_client.post(
        "/user/login", json={"username": "course_assistant", "password": "password123"}
    )
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest.mark.asyncio
async def test_assistant_sees_the_course(assistant_client, course_with_assistant):
    """Assistent oʻzi dars beradigan kursni koʻradi."""
    response = await assistant_client.get(f"/course/{course_with_assistant['course_id']}")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_assistant_cannot_manage_the_teacher_list(assistant_client, course_with_assistant):
    """Koʻrish va ishlash — ha, roʻyxatni oʻzgartirish — yoʻq."""
    response = await assistant_client.post(
        f"/course/{course_with_assistant['course_id']}/teachers",
        json={"user_id": course_with_assistant["main_user_id"]},
    )
    assert response.status_code == 403
