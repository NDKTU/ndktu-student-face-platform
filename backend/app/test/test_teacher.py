import pytest


@pytest.mark.asyncio
async def test_create_teacher(auth_client, test_kafedra):
    # Create an employee (User + profile + role) for the teacher
    employee_payload = {
        "username": "teacher_create_user",
        "password": "password123",
        "first_name": "Alice",
        "last_name": "Johnson",
        "third_name": "Marie",
        "roles": [{"name": "Admin"}],
    }
    employee_response = await auth_client.post("/employee/", json=employee_payload)
    assert employee_response.status_code == 201
    employee_data = employee_response.json()

    payload = {
        "kafedra_id": test_kafedra["id"],
        "employee_id": employee_data["id"],
    }
    response = await auth_client.post("/teacher/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["employee"]["first_name"] == employee_payload["first_name"]
    assert data["kafedra_id"] == payload["kafedra_id"]
    assert "id" in data


@pytest.mark.asyncio
async def test_get_teacher(auth_client, test_teacher):
    response = await auth_client.get(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_teacher["id"]
    assert data["employee"]["full_name"] is not None


@pytest.mark.asyncio
async def test_list_teachers(auth_client, test_teacher):
    response = await auth_client.get("/teacher/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["teachers"]) >= 1


@pytest.mark.asyncio
async def test_update_teacher(auth_client, test_teacher, test_faculty):
    # employee_id is immutable after creation — update_teacher only reassigns kafedra
    new_kafedra_response = await auth_client.post(
        "/kafedra/", json={"name": "Another Kafedra", "faculty_id": test_faculty["id"]}
    )
    assert new_kafedra_response.status_code == 201
    new_kafedra = new_kafedra_response.json()

    payload = {"kafedra_id": new_kafedra["id"]}
    response = await auth_client.put(f"/teacher/{test_teacher['id']}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["kafedra_id"] == new_kafedra["id"]
    assert data["employee"]["id"] == test_teacher["employee_id"]


@pytest.mark.asyncio
async def test_delete_teacher(auth_client, test_teacher):
    response = await auth_client.delete(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 204

    # Verify deletion
    response = await auth_client.get(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_assign_and_read_subjects(auth_client, test_teacher, test_subject):
    """Регресс: ответ разворачивает ФИО из employee, и без eager-load
    эндпоинт падал с MissingGreenlet (500) на «Mening fanlarim» и в карточке
    преподавателя у админа."""
    assign = await auth_client.post(
        "/teacher/assign_subjects",
        json={"teacher_id": test_teacher["id"], "subject_ids": [test_subject.id]},
    )
    assert assign.status_code == 200

    user_id = test_teacher["employee"]["user_id"]
    response = await auth_client.get(f"/teacher/assigned_subjects/by-user/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == user_id
    assert data["full_name"]
    assert [st["subject"]["id"] for st in data["subject_teachers"]] == [test_subject.id]
