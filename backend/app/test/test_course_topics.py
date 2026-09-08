import pytest


@pytest.mark.asyncio
async def test_course_topics_and_lesson_linkage(
    auth_client,
    test_teacher,
    test_subject,
    test_group,
    test_faculty,
    test_kafedra,
):
    teacher_user_id = test_teacher["user_id"]
    course_response = await auth_client.post(
        "/course/",
        json={
            "name": "Calculus",
            "subject_id": test_subject.id,
            "teacher_id": teacher_user_id,
            "group_ids": [test_group["id"]],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course_response.status_code == 201
    course_id = course_response.json()["id"]

    topic_response = await auth_client.post(
        "/course-topic/",
        json={"course_id": course_id, "topic_type": "lecture", "title": "Limits", "order_index": 1},
    )
    assert topic_response.status_code == 201
    topic_id = topic_response.json()["id"]

    lesson_response = await auth_client.post(
        "/lesson/",
        json={
            "course_id": course_id,
            "group_id": test_group["id"],
            "topic_id": topic_id,
            "topic": "Introduction to limits",
            "date": "2026-08-21",
        },
    )
    assert lesson_response.status_code == 201
    lesson = lesson_response.json()
    assert lesson["topic_id"] == topic_id
    assert lesson["course_topic"]["title"] == "Limits"
    assert topic_response.json()["topic_type"] == "lecture"
    assert lesson["resources"] == []

    topics_response = await auth_client.get("/course-topic/", params={"course_id": course_id})
    assert topics_response.status_code == 200
    assert topics_response.json()["topics"][0]["lesson_count"] == 1

    course_detail = await auth_client.get(f"/course/{course_id}")
    assert course_detail.status_code == 200
    assert course_detail.json()["topic_count"] == 1
    assert course_detail.json()["lesson_count"] == 1

    lessons_response = await auth_client.get("/lesson/", params={"course_id": course_id})
    assert lessons_response.status_code == 200
    assert lessons_response.json()["lessons"][0]["course_topic"]["id"] == topic_id


@pytest.mark.asyncio
async def test_lesson_rejects_topic_from_another_course(
    auth_client,
    test_teacher,
    test_subject,
    test_group,
):
    teacher_user_id = test_teacher["user_id"]
    first = await auth_client.post(
        "/course/",
        json={
            "name": "First course",
            "subject_id": test_subject.id,
            "teacher_id": teacher_user_id,
            "group_ids": [test_group["id"]],
        },
    )
    second = await auth_client.post(
        "/course/",
        json={
            "name": "Second course",
            "subject_id": test_subject.id,
            "teacher_id": teacher_user_id,
            "group_ids": [test_group["id"]],
        },
    )
    assert first.status_code == second.status_code == 201

    topic = await auth_client.post(
        "/course-topic/",
        json={"course_id": first.json()["id"], "topic_type": "lecture", "title": "First topic"},
    )
    assert topic.status_code == 201

    response = await auth_client.post(
        "/lesson/",
        json={
            "course_id": second.json()["id"],
            "group_id": test_group["id"],
            "topic_id": topic.json()["id"],
            "topic": "Wrong course topic",
            "date": "2026-08-21",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Topic does not belong to this Course"


@pytest.mark.asyncio
async def test_topic_title_is_derived_from_type(
    auth_client,
    test_teacher,
    test_subject,
    test_group,
    test_faculty,
    test_kafedra,
):
    """Sarlavhasiz yaratilgan mavzu nomini turidan oladi.

    Formada alohida nom maydoni yo'q: o'qituvchi faqat turni tanlaydi.
    """
    course = await auth_client.post(
        "/course/",
        json={
            "name": "Physics",
            "subject_id": test_subject.id,
            "teacher_id": test_teacher["user_id"],
            "group_ids": [test_group["id"]],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course.status_code == 201

    topic = await auth_client.post(
        "/course-topic/",
        json={"course_id": course.json()["id"], "topic_type": "lab"},
    )
    assert topic.status_code == 201
    assert topic.json()["title"] == "Laboratoriya"
    assert topic.json()["topic_type"] == "lab"


@pytest.mark.asyncio
async def test_topic_type_is_required(
    auth_client,
    test_teacher,
    test_subject,
    test_group,
    test_faculty,
    test_kafedra,
):
    """Tursiz mavzu yaratib bo'lmaydi: darslar turini shundan oladi."""
    course = await auth_client.post(
        "/course/",
        json={
            "name": "Chemistry",
            "subject_id": test_subject.id,
            "teacher_id": test_teacher["user_id"],
            "group_ids": [test_group["id"]],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course.status_code == 201

    topic = await auth_client.post(
        "/course-topic/",
        json={"course_id": course.json()["id"], "title": "Tursiz"},
    )
    assert topic.status_code == 422
