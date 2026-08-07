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
    assert response.json()["detail"] == f"Role '{payload['name']}' already exists"


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
    assert response.json()["detail"] == "Role not found"


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
    assert response.json()["detail"] == "Role not found"


@pytest.mark.asyncio
async def test_delete_role(auth_client):
    responnse = await auth_client.delete("/role/1")
    assert responnse.status_code == 204


@pytest.mark.asyncio
async def test_delete_role_not_found(auth_client):
    responnse = await auth_client.delete("/role/112")
    assert responnse.status_code == 404


@pytest.mark.asyncio
async def test_list_roles_filters_by_name(auth_client):
    """Фильтр подстрочный и без учёта регистра — как в остальных `list_*`."""
    await auth_client.post("/role/", json={"name": "dekan"})
    await auth_client.post("/role/", json={"name": "Teacher"})

    response = await auth_client.get("/role/", params={"page": 1, "limit": 10, "name": "DEK"})

    assert response.status_code == 200
    body = response.json()
    assert [r["name"] for r in body["roles"]] == ["dekan"]
    # total тоже обязан учитывать фильтр, иначе клиент нарисует лишние страницы.
    assert body["total"] == 1
