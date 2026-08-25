"""`POST /teacher/` endi bir vaqtning o'zida `User` va o'qituvchi kartochkasini
yaratadi — `Employee` `Teacher` ichiga birlashtirilgandan keyin alohida xodim
endpoint'i qolmadi. Shu sababli eski `test_employee.py` dagi qamrov
(hisob yaratish, dublikatlar, yetim `User` bo'lmasligi) shu yerga ko'chirildi.
"""

import pytest


@pytest.mark.asyncio
async def test_create_teacher_creates_user_and_profile(auth_client, test_kafedra):
    payload = {
        "username": "teacher_one",
        "password": "password123",
        "first_name": "Ali",
        "last_name": "Valiyev",
        "third_name": "Aliyevich",
        "kafedra_id": test_kafedra["id"],
        "roles": [{"name": "Admin"}],
    }
    response = await auth_client.post("/teacher/", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["full_name"] == "Valiyev Ali Aliyevich"
    assert body["first_name"] == payload["first_name"]
    assert body["kafedra_id"] == test_kafedra["id"]
    assert body["user_id"] is not None
    assert body["user"]["username"] == payload["username"]

    # Yaratilgan hisob haqiqatan ham ishlashi kerak.
    login_response = await auth_client.post(
        "/user/login",
        json={"username": payload["username"], "password": payload["password"]},
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


@pytest.mark.asyncio
async def test_create_teacher_duplicate_username(auth_client):
    payload = {
        "username": "teacher_dup_user",
        "password": "password123",
        "first_name": "Bob",
        "last_name": "Brown",
        "third_name": "Lee",
        "roles": [{"name": "Admin"}],
    }
    first = await auth_client.post("/teacher/", json=payload)
    assert first.status_code == 201

    second_payload = {**payload, "first_name": "Different", "last_name": "Person", "third_name": "Name"}
    second = await auth_client.post("/teacher/", json=second_payload)
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_create_teacher_duplicate_full_name_leaves_no_orphan_user(auth_client):
    payload = {
        "username": "teacher_name_a",
        "password": "password123",
        "first_name": "Carol",
        "last_name": "White",
        "third_name": "Anne",
        "roles": [{"name": "Admin"}],
    }
    first = await auth_client.post("/teacher/", json=payload)
    assert first.status_code == 201

    second_payload = {**payload, "username": "teacher_name_b"}
    second = await auth_client.post("/teacher/", json=second_payload)
    assert second.status_code == 400

    # Muvaffaqiyatsiz urinishdan yetim `User` qolmasligi kerak.
    users_resp = await auth_client.get("/user/", params={"username": "teacher_name_b"})
    assert users_resp.status_code == 200
    assert users_resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_get_teacher(auth_client, test_teacher):
    response = await auth_client.get(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_teacher["id"]
    assert data["full_name"] == "Doe John Smith"


@pytest.mark.asyncio
async def test_list_teachers(auth_client, test_teacher):
    response = await auth_client.get("/teacher/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert any(t["id"] == test_teacher["id"] for t in data["teachers"])

    # Ism bo'yicha filtr endi to'g'ridan-to'g'ri `teachers.full_name` ustida.
    filtered = await auth_client.get("/teacher/", params={"full_name": "Doe"})
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1

    empty = await auth_client.get("/teacher/", params={"full_name": "Nobody"})
    assert empty.json()["total"] == 0


@pytest.mark.asyncio
async def test_update_teacher_changes_names_and_kafedra(auth_client, test_teacher, test_faculty):
    new_kafedra_response = await auth_client.post(
        "/kafedra/", json={"name": "Another Kafedra", "faculty_id": test_faculty["id"]}
    )
    assert new_kafedra_response.status_code == 201
    new_kafedra = new_kafedra_response.json()

    payload = {
        "first_name": "Johnny",
        "last_name": "Doe",
        "third_name": "Smith",
        "kafedra_id": new_kafedra["id"],
    }
    response = await auth_client.put(f"/teacher/{test_teacher['id']}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["kafedra_id"] == new_kafedra["id"]
    assert data["first_name"] == "Johnny"
    assert data["full_name"] == "Doe Johnny Smith"
    # Hisob o'zgarmaydi: `username`/`user_id` o'sha-o'sha.
    assert data["user_id"] == test_teacher["user_id"]


@pytest.mark.asyncio
async def test_delete_teacher(auth_client, test_teacher):
    response = await auth_client.delete(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 204

    # Verify deletion
    response = await auth_client.get(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_assign_and_read_subjects(auth_client, test_teacher, test_subject):
    """Регресс: без eager-load эндпоинт падал с MissingGreenlet (500) на
    «Mening fanlarim» и в карточке преподавателя у админа."""
    assign = await auth_client.post(
        "/teacher/assign_subjects",
        json={"teacher_id": test_teacher["id"], "subject_ids": [test_subject.id]},
    )
    assert assign.status_code == 200

    user_id = test_teacher["user_id"]
    response = await auth_client.get(f"/teacher/assigned_subjects/by-user/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == user_id
    assert data["full_name"]
    assert [st["subject"]["id"] for st in data["subject_teachers"]] == [test_subject.id]


@pytest.mark.asyncio
async def test_assign_and_read_groups(auth_client, test_teacher, test_group):
    """Guruhlar hamon `User` ga biriktiriladi, javob esa o'qituvchi
    kartochkasidan o'qiladi — `teacher.user.group_teachers` zanjiri tirik."""
    user_id = test_teacher["user_id"]
    assign = await auth_client.post(
        "/teacher/assign_groups",
        json={"user_id": user_id, "group_ids": [test_group["id"]]},
    )
    assert assign.status_code == 200

    response = await auth_client.get(f"/teacher/assigned_groups/by-user/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == user_id
    assert [gt["group"]["id"] for gt in data["group_teachers"]] == [test_group["id"]]


@pytest.mark.asyncio
async def test_user_me_and_list_expose_teacher_profile(async_client, auth_client, test_teacher, test_kafedra):
    """`Employee` birlashgandan keyin `/user/me` va `/user/` javoblarida
    profil `teacher` kaliti ostida keladi. Kafedra zanjiri eager-load
    qilinmasa, ikkala endpoint ham MissingGreenlet bilan 500 beradi."""
    login = await async_client.post(
        "/user/login",
        json={"username": "teacher_fixture_user", "password": "password123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = await async_client.get("/user/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["student"] is None
    assert body["teacher"]["id"] == test_teacher["id"]
    assert body["teacher"]["full_name"] == "Doe John Smith"
    assert body["teacher"]["kafedra"]["id"] == test_kafedra["id"]

    listed = await auth_client.get("/user/", params={"username": "teacher_fixture_user"})
    assert listed.status_code == 200
    users = listed.json()["users"]
    assert len(users) == 1
    assert users[0]["teacher"]["kafedra"]["id"] == test_kafedra["id"]
