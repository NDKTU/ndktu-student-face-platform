import pytest


@pytest.mark.asyncio
async def test_create_faculty(auth_client):
    payload = {"name": "Economics Faculty"}
    response = await auth_client.post("/faculty/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"].lower()
    assert "id" in data


@pytest.mark.asyncio
async def test_get_faculty(auth_client, test_faculty):
    response = await auth_client.get(f"/faculty/{test_faculty['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_faculty["id"]
    assert data["name"] == test_faculty["name"]


@pytest.mark.asyncio
async def test_list_faculties(auth_client, test_faculty):
    response = await auth_client.get("/faculty/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["faculties"]) >= 1


@pytest.mark.asyncio
async def test_update_faculty(auth_client, test_faculty):
    payload = {"name": "Updated Faculty Name"}
    response = await auth_client.put(f"/faculty/{test_faculty['id']}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"].lower()


@pytest.mark.asyncio
async def test_delete_faculty(auth_client, test_faculty):
    response = await auth_client.delete(f"/faculty/{test_faculty['id']}")
    assert response.status_code == 204

    # Verify deletion
    response = await auth_client.get(f"/faculty/{test_faculty['id']}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_faculty_warns_about_lessons_of_its_groups(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Каскад факультета сносит его группы, а вместе с ними — занятия.
    `ensure_no_lessons` этого не видит: она считает через `teacher_subject_id`
    с RESTRICT, а здесь путь идёт через `lessons.group_id` с CASCADE."""
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
    # Guruh ataylab ko'rsatiladi: dars aynan shu guruhniki bo'lsagina u
    # guruh bilan birga o'chadi — tekshiruv shu haqda.
    lesson = await auth_client.post(
        "/lesson/",
        json={
            "course_id": course.json()["id"],
            "group_id": test_group["id"],
            "topic": "Grafalar",
            "date": "2026-08-21",
        },
    )
    assert lesson.status_code == 201, lesson.text

    response = await auth_client.delete(f"/faculty/{test_faculty['id']}")
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["requires_confirmation"] is True
    lesson_warnings = [w for w in detail["warnings"] if "dars tarixi" in w]
    assert lesson_warnings == ["1 ta o'tilgan dars tarixi guruhlar bilan birga butunlay o'chadi (tiklab bo'lmaydi)"]
