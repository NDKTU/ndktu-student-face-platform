import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_students(auth_client: AsyncClient):
    response = await auth_client.get("/students/")
    assert response.status_code == 200
    data = response.json()
    assert "students" in data
    assert "total" in data
    assert "page" in data
    assert "limit" in data


@pytest.mark.asyncio
async def test_get_student_by_id_not_found(auth_client: AsyncClient):
    response = await auth_client.get("/students/99999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Student not found"


# Bu test oʻchirilgan endpointni tekshirardi: entity yaratish/oʻzgartirish/
# oʻchirish 2026-09-11 da kommentga olindi (maʼlumot EPOS/HEMIS'dan keladi).
# Endpoint qaytarilsa — bu testni ham kommentdan chiqarish kerak.
# @pytest.mark.asyncio
# async def test_update_student_not_found(auth_client: AsyncClient):
#     response = await auth_client.put(
#         "/students/99999",
#         json={"first_name": "Updated Name"},
#     )
#     assert response.status_code == 404
#     assert response.json()["detail"] == "Student not found"


# Bu test oʻchirilgan endpointni tekshirardi: entity yaratish/oʻzgartirish/
# oʻchirish 2026-09-11 da kommentga olindi (maʼlumot EPOS/HEMIS'dan keladi).
# Endpoint qaytarilsa — bu testni ham kommentdan chiqarish kerak.
# @pytest.mark.asyncio
# async def test_delete_student_not_found(auth_client: AsyncClient):
#     response = await auth_client.delete("/students/99999")
#     assert response.status_code == 404
#     assert response.json()["detail"] == "Student not found"


# Note: Detailed CRUD tests (Create, Update, Delete success) heavily depend on
# existing data or complex seeding (User, Group, Faculty, etc.).
# Since I cannot modify conftest.py or guarantee seeded data state easily without
# running the whole suite, I am focusing on:
# 1. List (likely returns empty or existing)
# 2. Not Found scenarios (safe to test)
#
# If a way to create a valid full Student payload with all relations exists,
# we would add it here. For now, following the pattern of testing safe endpoints.
