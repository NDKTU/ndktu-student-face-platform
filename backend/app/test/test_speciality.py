import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def test_speciality(auth_client, test_kafedra):
    payload = {
        "name": "Computer Engineering",
        "kafedra_id": test_kafedra["id"],
        "education_type": "Bakalavr",
    }
    response = await auth_client.post("/speciality/", json=payload)
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_create_speciality(test_speciality, test_kafedra):
    assert test_speciality["name"] == "Computer Engineering"
    assert test_speciality["kafedra_id"] == test_kafedra["id"]
    assert test_speciality["education_type"] == "Bakalavr"


@pytest.mark.asyncio
async def test_create_duplicate_in_same_kafedra_rejected(auth_client, test_speciality, test_kafedra):
    payload = {"name": test_speciality["name"], "kafedra_id": test_kafedra["id"]}
    response = await auth_client.post("/speciality/", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_same_name_allowed_in_another_kafedra(auth_client, test_speciality, test_faculty):
    """Одно направление может вестись на двух кафедрах — БД ограничивает пару."""
    other_kafedra = await auth_client.post(
        "/kafedra/", json={"name": "Information Security", "faculty_id": test_faculty["id"]}
    )
    assert other_kafedra.status_code == 201

    response = await auth_client.post(
        "/speciality/", json={"name": test_speciality["name"], "kafedra_id": other_kafedra.json()["id"]}
    )
    assert response.status_code == 201
    assert response.json()["education_type"] is None


@pytest.mark.asyncio
async def test_list_and_get_speciality(auth_client, test_speciality, test_kafedra):
    listed = await auth_client.get("/speciality/", params={"kafedra_id": test_kafedra["id"]})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    single = await auth_client.get(f"/speciality/{test_speciality['id']}")
    assert single.status_code == 200
    assert single.json()["name"] == test_speciality["name"]


@pytest.mark.asyncio
async def test_update_speciality(auth_client, test_speciality, test_kafedra):
    payload = {
        "name": "Computer Engineering (updated)",
        "kafedra_id": test_kafedra["id"],
        "education_type": None,
    }
    response = await auth_client.put(f"/speciality/{test_speciality['id']}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"]
    # Явный null очищает тип обучения, а не игнорируется как «поле не передано».
    assert data["education_type"] is None


@pytest.mark.asyncio
async def test_delete_speciality(auth_client, test_speciality):
    response = await auth_client.delete(f"/speciality/{test_speciality['id']}")
    assert response.status_code == 204

    assert (await auth_client.get(f"/speciality/{test_speciality['id']}")).status_code == 404


@pytest.mark.asyncio
async def test_delete_with_groups_requires_confirmation(auth_client, async_db, test_speciality, test_faculty):
    """Группы переживают удаление (ON DELETE SET NULL), но теряют привязку."""
    from app.modules.organization_structure.model import Group

    group = Group(name="CE-2026", faculty_id=test_faculty["id"], speciality_id=test_speciality["id"])
    async_db.add(group)
    await async_db.flush()

    blocked = await auth_client.delete(f"/speciality/{test_speciality['id']}")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["requires_confirmation"] is True

    forced = await auth_client.delete(f"/speciality/{test_speciality['id']}", params={"force": True})
    assert forced.status_code == 204

    await async_db.refresh(group)
    assert group.speciality_id is None


@pytest.mark.asyncio
async def test_speciality_accepts_doctorate(auth_client, test_kafedra):
    response = await auth_client.post(
        "/speciality/",
        json={"name": "Sun'iy intellekt", "kafedra_id": test_kafedra["id"], "education_type": "Doktorantura"},
    )
    assert response.status_code == 201
    assert response.json()["education_type"] == "Doktorantura"
