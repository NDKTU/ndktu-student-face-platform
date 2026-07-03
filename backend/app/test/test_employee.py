import pytest


@pytest.mark.asyncio
async def test_create_employee(auth_client):
    payload = {
        "username": "employee_create_user",
        "password": "password123",
        "first_name": "Alice",
        "last_name": "Johnson",
        "third_name": "Marie",
        "roles": [{"name": "Admin"}],
    }
    response = await auth_client.post("/employee/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["first_name"] == payload["first_name"]
    assert data["full_name"] == f"{payload['last_name']} {payload['first_name']} {payload['third_name']}"
    assert data["user"]["username"] == payload["username"]
    assert data["teacher"] is None

    # The created credentials must actually work.
    login_response = await auth_client.post(
        "/user/login",
        json={"username": payload["username"], "password": payload["password"]},
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


@pytest.mark.asyncio
async def test_create_employee_duplicate_username(auth_client):
    payload = {
        "username": "employee_dup_user",
        "password": "password123",
        "first_name": "Bob",
        "last_name": "Brown",
        "third_name": "Lee",
        "roles": [{"name": "Admin"}],
    }
    first = await auth_client.post("/employee/", json=payload)
    assert first.status_code == 201

    second_payload = {**payload, "first_name": "Different", "last_name": "Person", "third_name": "Name"}
    second = await auth_client.post("/employee/", json=second_payload)
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_create_employee_duplicate_full_name(auth_client):
    payload = {
        "username": "employee_name_a",
        "password": "password123",
        "first_name": "Carol",
        "last_name": "White",
        "third_name": "Anne",
        "roles": [{"name": "Admin"}],
    }
    first = await auth_client.post("/employee/", json=payload)
    assert first.status_code == 201

    second_payload = {**payload, "username": "employee_name_b"}
    second = await auth_client.post("/employee/", json=second_payload)
    assert second.status_code == 400

    # No orphan User should have been created for the failed second attempt.
    users_resp = await auth_client.get("/user/", params={"username": "employee_name_b"})
    assert users_resp.status_code == 200
    assert users_resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_get_and_list_employee(auth_client):
    payload = {
        "username": "employee_get_user",
        "password": "password123",
        "first_name": "Dave",
        "last_name": "Green",
        "third_name": "Paul",
        "roles": [{"name": "Admin"}],
    }
    created = (await auth_client.post("/employee/", json=payload)).json()

    get_resp = await auth_client.get(f"/employee/{created['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == created["id"]

    list_resp = await auth_client.get("/employee/")
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert data["total"] >= 1
    assert any(e["id"] == created["id"] for e in data["employees"])


@pytest.mark.asyncio
async def test_update_employee(auth_client):
    payload = {
        "username": "employee_update_user",
        "password": "password123",
        "first_name": "Eve",
        "last_name": "Black",
        "third_name": "Rose",
        "roles": [{"name": "Admin"}],
    }
    created = (await auth_client.post("/employee/", json=payload)).json()

    update_payload = {
        "first_name": "Eve Updated",
        "last_name": "Black",
        "third_name": "Rose",
        "phone_number": "+998901234567",
    }
    response = await auth_client.put(f"/employee/{created['id']}", json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["first_name"] == "Eve Updated"
    assert data["phone_number"] == "+998901234567"


@pytest.mark.asyncio
async def test_delete_employee_cascades_teacher(auth_client, test_kafedra):
    payload = {
        "username": "employee_delete_user",
        "password": "password123",
        "first_name": "Frank",
        "last_name": "Grey",
        "third_name": "Neil",
        "roles": [{"name": "Admin"}],
    }
    employee = (await auth_client.post("/employee/", json=payload)).json()

    teacher_resp = await auth_client.post(
        "/teacher/", json={"kafedra_id": test_kafedra["id"], "employee_id": employee["id"]}
    )
    assert teacher_resp.status_code == 201
    teacher = teacher_resp.json()

    delete_resp = await auth_client.delete(f"/employee/{employee['id']}", params={"force": "true"})
    assert delete_resp.status_code == 204

    assert (await auth_client.get(f"/employee/{employee['id']}")).status_code == 404
    assert (await auth_client.get(f"/teacher/{teacher['id']}")).status_code == 404
