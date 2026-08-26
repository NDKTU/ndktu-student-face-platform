import pytest


@pytest.mark.asyncio
async def test_catalog_and_analytics_endpoints(
    auth_client,
    test_user,
    test_faculty,
    test_kafedra,
    test_group,
    test_subject,
    make_questions,
):
    speciality_response = await auth_client.post(
        "/speciality/",
        json={"name": "Software systems", "kafedra_id": test_kafedra["id"]},
    )
    assert speciality_response.status_code == 201

    kafedra_stats = await auth_client.get("/kafedra/stats", params={"faculty_id": test_faculty["id"]})
    assert kafedra_stats.status_code == 200
    assert kafedra_stats.json()["stats"][0]["speciality_count"] == 1

    speciality_stats = await auth_client.get("/speciality/stats", params={"kafedra_id": test_kafedra["id"]})
    assert speciality_stats.status_code == 200
    assert speciality_stats.json()["stats"][0]["group_count"] == 0

    course_response = await auth_client.post(
        "/course/",
        json={
            "name": "Backend fundamentals",
            "subject_id": test_subject.id,
            "teacher_id": test_user["id"],
            "group_ids": [test_group["id"]],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course_response.status_code == 201
    course_catalog = await auth_client.get("/course/teachers/summary")
    assert course_catalog.status_code == 200
    assert course_catalog.json()["teachers"][0]["course_count"] == 1

    await make_questions(test_subject.id, test_user["id"], count=2)
    question_catalog = await auth_client.get("/question/catalog")
    assert question_catalog.status_code == 200
    assert question_catalog.json()["teachers"][0]["question_count"] == 2

    quiz_response = await auth_client.post(
        "/quiz/",
        json={
            "title": "Backend quiz",
            "question_number": 2,
            "duration": 20,
            "pin": "1234",
            "lecturer_id": test_user["id"],
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
            "is_active": False,
            "proctoring_mode": "standard",
        },
    )
    assert quiz_response.status_code == 201
    quiz_id = quiz_response.json()["id"]

    quiz_catalog = await auth_client.get("/quiz/catalog")
    assert quiz_catalog.status_code == 200
    assert quiz_catalog.json()["faculties"][0]["quiz_count"] == 1

    analytics = await auth_client.get(f"/quiz/{quiz_id}/analytics")
    assert analytics.status_code == 200
    assert analytics.json()["quiz_id"] == quiz_id
    assert analytics.json()["submitted_count"] == 0
