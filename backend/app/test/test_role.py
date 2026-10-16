import pytest


@pytest.mark.asyncio
async def test_create_role(auth_client):
    payload = {"name": "user"}
    response = await auth_client.post("/role/", json=payload)
    assert response.status_code == 201
    assert response.json()["name"] == "user"
    assert "id" in response.json()
    assert "created_at" in response.json()
    assert "updated_at" in response.json()


@pytest.mark.asyncio
async def test_create_role_duplicate(auth_client):
    payload = {"name": "user"}
    response = await auth_client.post("/role/", json=payload)
    assert response.status_code == 201
    assert response.json()["name"] == "user"
    assert "id" in response.json()
    assert "created_at" in response.json()
    assert "updated_at" in response.json()

    response = await auth_client.post("/role/", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "role_already_exists"


@pytest.mark.asyncio
async def test_get_role_by_id(auth_client):
    response = await auth_client.get("/role/1")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["name"] == "Admin"
    assert "created_at" in response.json()
    assert "updated_at" in response.json()


@pytest.mark.asyncio
async def test_get_role_not_found(auth_client):
    response = await auth_client.get("/role/112")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "role_not_found"


@pytest.mark.asyncio
async def test_get_all_roles(auth_client):
    response = await auth_client.get(
        "/user/",
        params={
            "page": 1,
            "limit": 10,
        },
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_role_name(auth_client):
    response = await auth_client.put("/role/1", json={"name": "admin"})
    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["name"] == "admin"
    assert "created_at" in response.json()
    assert "updated_at" in response.json()


@pytest.mark.asyncio
async def test_update_role_name_not_found(auth_client):
    response = await auth_client.put("/role/113", json={"name": "admin"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "role_not_found"


@pytest.mark.asyncio
async def test_delete_role(auth_client):
    # Interfeysda yaratilgan rol o'chadi. `/role/1` — Admin, tizim roli:
    # uni o'chirish endi taqiqlangan (`test_system_roles.py`).
    created = await auth_client.post("/role/", json={"name": "Vaqtinchalik rol"})
    assert created.status_code == 201, created.text
    responnse = await auth_client.delete(f"/role/{created.json()['id']}")
    assert responnse.status_code == 204

    assert (await auth_client.delete("/role/1")).status_code == 400


@pytest.mark.asyncio
async def test_delete_role_not_found(auth_client):
    responnse = await auth_client.delete("/role/112")
    assert responnse.status_code == 404
