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
async def test_lesson_belongs_to_the_whole_course_by_default(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Guruh so'ralmaydi: dars kursning barcha guruhlariga tegishli.

    Kursda to'qqiztagacha guruh bo'ladi va har biriga bir xil darsni qayta
    yozish o'qituvchining ishini shuncha marta takrorlashi edi.
    """
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Calculus"
    )

    response = await auth_client.post(
        "/lesson/",
        json={"course_id": course_id, "topic": "Introduction", "date": "2026-08-21"},
    )
    assert response.status_code == 201
    assert response.json()["group_id"] is None


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
async def test_several_groups_no_longer_block_lesson_creation(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Bir nechta guruhli kursda ham guruh so'ralmaydi.

    Ilgari bu yerda 400 qaytarilardi va o'qituvchi darsni har guruhga qayta
    yozishga majbur edi.
    """
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

    shared = await auth_client.post(
        "/lesson/",
        json={"course_id": course_id, "topic": "Introduction", "date": "2026-08-21"},
    )
    assert shared.status_code == 201
    assert shared.json()["group_id"] is None

    # Bitta guruhga alohida dars kerak bo'lsa — guruhni ko'rsatish mumkin.
    explicit = await auth_client.post(
        "/lesson/",
        json={
            "course_id": course_id,
            "group_id": second_group.json()["id"],
            "topic": "Faqat bitta guruhga",
            "date": "2026-08-21",
        },
    )
    assert explicit.status_code == 201
    assert explicit.json()["group_id"] == second_group.json()["id"]


@pytest.mark.asyncio
async def test_foreign_group_is_still_rejected(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Kursga kirmaydigan guruhni ko'rsatib bo'lmaydi.

    Guruh endi ixtiyoriy, lekin ko'rsatilgani tekshiriladi: aks holda dars
    umuman begona guruhga osilib qolardi.
    """
    outsider = await auth_client.post("/group/", json={"name": "SE-2025", "faculty_id": test_faculty["id"]})
    assert outsider.status_code == 201
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Physics"
    )

    response = await auth_client.post(
        "/lesson/",
        json={
            "course_id": course_id,
            "group_id": outsider.json()["id"],
            "topic": "Introduction",
            "date": "2026-08-21",
        },
    )
    assert response.status_code == 400
