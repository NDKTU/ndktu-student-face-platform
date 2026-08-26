"""Regress: `users.id` -> `teachers.id` sakrashi ko'rinuvchanlik filtrlarida.

`GroupTeacher.teacher_id` ilgari `users.id` ga qaragan edi, `TeacherGroup` esa
`teachers.id` ga qaraydi. Shuning uchun tokendagi foydalanuvchidan boshlanadigan
har bir filtr endi `Teacher` orqali sakrashi shart.

Bu sakrash tushib qolsa hech narsa xato bermaydi: ikkala id ham mavjud butun son,
so'rov shunchaki BOSHQA o'qituvchining satrlarini qaytaradi. Shu sababli fixture
id'larni ataylab shunday joylashtiradi: **A o'qituvchining `users.id` si B
o'qituvchining `teachers.id` siga teng**. Sakrash yo'qolsa, A darrov B ning
guruhini va testlarini ko'rib qoladi — test qizil bo'ladi.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from main import app as fastapi_app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def visibility_fixture(async_client, auth_client, async_db, test_faculty, test_kafedra):
    from app.modules.auth.model import Permission, Role
    from app.modules.quiz.model import Quiz, Subject

    # "Teacher" roli — nomi aynan shunday bo'lishi kerak, repozitoriylar
    # `role.name.lower() == "teacher"` bo'yicha tarmoqlanadi.
    permissions = [Permission(name="read:group"), Permission(name="read:quiz")]
    async_db.add_all(permissions)
    await async_db.flush()
    async_db.add(Role(name="Teacher", permissions=permissions))
    await async_db.commit()

    async def _make_teacher(username: str) -> dict:
        response = await auth_client.post(
            "/teacher/",
            json={
                "username": username,
                "password": "password123",
                "first_name": username,
                "last_name": "T",
                "third_name": "T",
                "kafedra_id": test_kafedra["id"],
                "roles": [{"name": "Teacher"}],
            },
        )
        assert response.status_code == 201
        return response.json()

    async def _make_group(name: str) -> dict:
        response = await auth_client.post("/group/", json={"name": name, "faculty_id": test_faculty["id"]})
        assert response.status_code == 201
        return response.json()

    teacher_a = await _make_teacher("visibility_teacher_a")
    teacher_b = await _make_teacher("visibility_teacher_b")

    # Tuzoqning o'zi. Bu tenglik buzilsa test o'z ma'nosini yo'qotadi, shuning
    # uchun tekshirib qo'yamiz — jimgina zararsizlanib qolmasin.
    assert teacher_a["user_id"] == teacher_b["id"], (
        "Fixture kutilgan id joylashuvini bermadi: A ning user_id si B ning teachers.id siga teng bo'lishi kerak"
    )
    assert teacher_a["id"] != teacher_a["user_id"]

    group_a = await _make_group("VIS-A")
    group_b = await _make_group("VIS-B")

    for teacher, group in ((teacher_a, group_a), (teacher_b, group_b)):
        assign = await auth_client.post(
            "/teacher/assign_groups",
            json={"teacher_id": teacher["id"], "group_ids": [group["id"]]},
        )
        assert assign.status_code == 200

    # Testlarni to'g'ridan-to'g'ri yozamiz: bu yerda ularni yaratish emas,
    # ko'rinuvchanligi tekshiriladi. Lektor — administrator, fan esa hech kimga
    # biriktirilmagan, ya'ni testni faqat GURUH bo'yicha ko'rish mumkin.
    subject = Subject(name="Unassigned subject")
    async_db.add(subject)
    await async_db.flush()
    for group in (group_a, group_b):
        async_db.add(
            Quiz(
                title=f"Quiz for {group['name']}",
                question_number=1,
                duration=30,
                pin=f"pin{group['id']}",
                group_id=group["id"],
                subject_id=subject.id,
                lecturer_id=None,
            )
        )
    await async_db.commit()

    login = await async_client.post(
        "/user/login",
        json={"username": "visibility_teacher_a", "password": "password123"},
    )
    assert login.status_code == 200

    client_a = AsyncClient(
        transport=ASGITransport(app=fastapi_app),
        base_url="http://localhost/api",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    try:
        yield {"client_a": client_a, "teacher_a": teacher_a, "group_a": group_a, "group_b": group_b}
    finally:
        await client_a.aclose()


async def test_teacher_sees_only_own_groups(visibility_fixture):
    """`GET /group/` — ro'yxat ham, `total` ham o'z guruhi bilan cheklanadi."""
    response = await visibility_fixture["client_a"].get("/group/")
    assert response.status_code == 200

    body = response.json()
    assert [g["id"] for g in body["groups"]] == [visibility_fixture["group_a"]["id"]]
    # `total` alohida count-so'rovdan keladi — unda ham sakrash bo'lishi shart.
    assert body["total"] == 1


async def test_teacher_sees_only_own_groups_quizzes(visibility_fixture):
    """`GET /quiz/` — guruhga biriktiruv orqali ko'rinuvchanlik.

    Testlarning lektori boshqa odam, fani esa o'qituvchiga biriktirilmagan, ya'ni
    ularni ko'rishning yagona yo'li — guruh biriktirmasi.
    """
    response = await visibility_fixture["client_a"].get("/quiz/")
    assert response.status_code == 200

    titles = [q["title"] for q in response.json()["quizzes"]]
    assert titles == [f"Quiz for {visibility_fixture['group_a']['name']}"]
