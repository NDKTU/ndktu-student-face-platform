import pytest


async def _create_course(auth_client, test_teacher, test_subject, test_faculty, test_kafedra, group_ids, name):
    response = await auth_client.post(
        "/course/",
        json={
            "name": name,
            "subject_id": test_subject.id,
            "teacher_id": test_teacher["user_id"],
            "group_ids": group_ids,
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.mark.asyncio
async def test_lesson_inherits_the_only_group_of_the_course(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Группа у курса уже выбрана — при создании дарса её не спрашивают."""
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Calculus"
    )

    response = await auth_client.post(
        "/lesson/",
        json={"course_id": course_id, "topic": "Introduction", "date": "2026-08-21"},
    )
    assert response.status_code == 201
    assert response.json()["group_id"] == test_group["id"]


@pytest.mark.asyncio
async def test_lesson_without_date_defaults_to_today(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Форма дарса не спрашивает дату — проставляется сегодняшняя (Ташкент)."""
    from datetime import datetime

    from app.core.schemas import TASHKENT_TZ

    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Geometry"
    )

    response = await auth_client.post("/lesson/", json={"course_id": course_id, "topic": "Introduction"})
    assert response.status_code == 201
    lesson = response.json()
    assert lesson["date"] == datetime.now(TASHKENT_TZ).date().isoformat()


@pytest.mark.asyncio
async def test_lesson_requires_group_when_course_has_several(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    second_group = await auth_client.post("/group/", json={"name": "SE-2024", "faculty_id": test_faculty["id"]})
    assert second_group.status_code == 201
    course_id = await _create_course(
        auth_client,
        test_teacher,
        test_subject,
        test_faculty,
        test_kafedra,
        [test_group["id"], second_group.json()["id"]],
        "Algebra",
    )

    ambiguous = await auth_client.post(
        "/lesson/",
        json={"course_id": course_id, "topic": "Introduction", "date": "2026-08-21"},
    )
    assert ambiguous.status_code == 400

    explicit = await auth_client.post(
        "/lesson/",
        json={
            "course_id": course_id,
            "group_id": second_group.json()["id"],
            "topic": "Introduction",
            "date": "2026-08-21",
        },
    )
    assert explicit.status_code == 201
    assert explicit.json()["group_id"] == second_group.json()["id"]
