import pytest


@pytest.mark.asyncio
async def test_create_group(auth_client, test_faculty):
    payload = {"name": "Math-101", "faculty_id": test_faculty["id"]}
    response = await auth_client.post("/group/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["faculty_id"] == payload["faculty_id"]
    assert "id" in data


@pytest.mark.asyncio
async def test_get_group(auth_client, test_group):
    response = await auth_client.get(f"/group/{test_group['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_group["id"]
    assert data["name"] == test_group["name"]


@pytest.mark.asyncio
async def test_list_groups(auth_client, test_group):
    response = await auth_client.get("/group/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["groups"]) >= 1


@pytest.mark.asyncio
async def test_list_groups_filters_by_speciality_and_exposes_catalog_fields(
    auth_client, async_db, test_group, test_kafedra
):
    from app.modules.organization_structure.model import Group

    speciality_response = await auth_client.post(
        "/speciality/",
        json={"name": "Information systems", "kafedra_id": test_kafedra["id"]},
    )
    assert speciality_response.status_code == 201
    speciality_id = speciality_response.json()["id"]

    group = await async_db.get(Group, test_group["id"])
    group.speciality_id = speciality_id
    group.course = 2
    group.education_shape = "Kunduzgi"
    group.student_count = 24
    await async_db.commit()

    response = await auth_client.get("/group/", params={"speciality_id": speciality_id})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["groups"][0]["speciality_id"] == speciality_id
    assert data["groups"][0]["course"] == 2
    assert data["groups"][0]["education_shape"] == "Kunduzgi"
    assert data["groups"][0]["student_count"] == 24

    empty_response = await auth_client.get("/group/", params={"speciality_id": speciality_id + 999})
    assert empty_response.status_code == 200
    assert empty_response.json()["total"] == 0


@pytest.mark.asyncio
async def test_update_group(auth_client, test_group):
    payload = {"name": "Updated Group", "faculty_id": test_group["faculty_id"]}
    response = await auth_client.put(f"/group/{test_group['id']}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"]


@pytest.mark.asyncio
async def test_delete_group(auth_client, test_group):
    response = await auth_client.delete(f"/group/{test_group['id']}")
    assert response.status_code == 204

    # Verify deletion
    response = await auth_client.get(f"/group/{test_group['id']}")
    assert response.status_code == 404
