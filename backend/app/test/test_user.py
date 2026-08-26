import pytest


@pytest.mark.asyncio
async def test_create_user(auth_client):
    payload = {"name": "user"}
    response = await auth_client.post("/role/", json=payload)
    assert response.status_code == 201
    user_payload = {
        "username": "bezod",
        "password": "password123",
        "roles": [{"name": "user"}],
    }
    response = await auth_client.post("/user/", json=user_payload)
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_get_all_users(auth_client):
    response = await auth_client.get("/user/", params={"page": 1, "limit": 10, "username": "admin"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_user_id(auth_client):
    response = await auth_client.get("/user/1")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_user_not_foud(auth_client):
    response = await auth_client.get("/user/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


@pytest.mark.asyncio
async def test_update_user(auth_client):
    response = await auth_client.put("/user/1", json={"username": "admineer"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_user_user_not_found(auth_client):
    response = await auth_client.put("/user/999", json={"username": "admineer"})
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


@pytest.mark.asyncio
async def test_delete_user(auth_client):
    response = await auth_client.delete("/user/1")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_user_not_found(auth_client):
    response = await auth_client.delete("/user/1999")
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"


@pytest.mark.asyncio
async def test_delete_user_blocked_by_lessons_returns_409(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """DELETE /user/{id} сносит строку `teachers`, Postgres каскадит в
    `teacher_subject` и упирается в RESTRICT на `lessons.teacher_subject_id`.
    Раньше это доходило до клиента неотличимым 500; контракт ветки требует 409,
    как в DELETE /teacher/{id}. `force` эту проверку не обходит — история
    занятий не «подтверждаемое последствие», а жёсткое препятствие."""
    course = await auth_client.post(
        "/course/",
        json={
            "name": "Discrete math",
            "subject_id": test_subject.id,
            "teacher_id": test_teacher["user_id"],
            "group_ids": [test_group["id"]],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course.status_code == 201, course.text
    lesson = await auth_client.post(
        "/lesson/",
        json={"course_id": course.json()["id"], "topic": "Grafalar", "date": "2026-08-21"},
    )
    assert lesson.status_code == 201, lesson.text

    for url in (
        f"/user/{test_teacher['user_id']}",
        f"/user/{test_teacher['user_id']}?force=true",
    ):
        response = await auth_client.delete(url)
        assert response.status_code == 409, f"{url} -> {response.status_code}: {response.text}"
        assert "dars" in response.json()["detail"]
