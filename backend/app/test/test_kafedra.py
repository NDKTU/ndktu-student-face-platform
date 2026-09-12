import pytest

# Bu test oʻchirilgan endpointni tekshirardi: entity yaratish/oʻzgartirish/
# oʻchirish 2026-09-11 da kommentga olindi (maʼlumot EPOS/HEMIS'dan keladi).
# Endpoint qaytarilsa — bu testni ham kommentdan chiqarish kerak.
# @pytest.mark.asyncio
# async def test_create_kafedra(auth_client, test_faculty):
#     payload = {"name": "Applied Mathematics", "faculty_id": test_faculty["id"]}
#     response = await auth_client.post("/kafedra/", json=payload)
#     assert response.status_code == 201
#     data = response.json()
#     assert data["name"] == payload["name"]
#     assert data["faculty_id"] == payload["faculty_id"]
#     assert "id" in data


@pytest.mark.asyncio
async def test_get_kafedra(auth_client, test_kafedra):
    response = await auth_client.get(f"/kafedra/{test_kafedra['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_kafedra["id"]
    assert data["name"] == test_kafedra["name"]


@pytest.mark.asyncio
async def test_list_kafedras(auth_client, test_kafedra):
    response = await auth_client.get("/kafedra/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["kafedras"]) >= 1


# Bu test oʻchirilgan endpointni tekshirardi: entity yaratish/oʻzgartirish/
# oʻchirish 2026-09-11 da kommentga olindi (maʼlumot EPOS/HEMIS'dan keladi).
# Endpoint qaytarilsa — bu testni ham kommentdan chiqarish kerak.
# @pytest.mark.asyncio
# async def test_update_kafedra(auth_client, test_kafedra):
#     payload = {"name": "Updated Kafedra", "faculty_id": test_kafedra["faculty_id"]}
#     response = await auth_client.put(f"/kafedra/{test_kafedra['id']}", json=payload)
#     assert response.status_code == 200
#     data = response.json()
#     assert data["name"] == payload["name"]


# Bu test oʻchirilgan endpointni tekshirardi: entity yaratish/oʻzgartirish/
# oʻchirish 2026-09-11 da kommentga olindi (maʼlumot EPOS/HEMIS'dan keladi).
# Endpoint qaytarilsa — bu testni ham kommentdan chiqarish kerak.
# @pytest.mark.asyncio
# async def test_delete_kafedra(auth_client, test_kafedra):
#     response = await auth_client.delete(f"/kafedra/{test_kafedra['id']}")
#     assert response.status_code == 204
#
#     # Verify deletion
#     response = await auth_client.get(f"/kafedra/{test_kafedra['id']}")
#     assert response.status_code == 404
