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
    assert response.json()["detail"]["code"] == "student_not_found"


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


@pytest.mark.asyncio
async def test_student_list_and_detail_carry_group_name(auth_client: AsyncClient, async_db, test_group):
    """Guruh nomi javobda — «Talabalar» sahifasi uni 1000 ta guruhdan qidirmaydi."""
    from datetime import date

    from app.modules.auth.model import Student, User

    user = User(username="group_name_student", password="not-used")
    async_db.add(user)
    await async_db.flush()
    student = Student(
        user_id=user.id, group_id=test_group["id"], first_name="G", last_name="N", third_name="T",
        full_name="N G T", student_id_number="GN-001", image_path="", birth_date=date(2004, 1, 1),
        phone="", gender="male", university="NDKTU", specialty="Test", student_status="active",
        education_form="full_time", education_type="bachelor", payment_form="grant", education_lang="uz",
        faculty="F", level="1", semester="1", address="", avg_gpa=0,
    )
    async_db.add(student)
    await async_db.commit()

    listed = await auth_client.get("/students/", params={"group_id": test_group["id"]})
    assert listed.status_code == 200, listed.text
    row = next(s for s in listed.json()["students"] if s["id"] == student.id)
    assert row["group_name"] == test_group["name"]

    detail = await auth_client.get(f"/students/{student.id}")
    assert detail.json()["group_name"] == test_group["name"]
