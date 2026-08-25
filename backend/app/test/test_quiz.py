import pytest


@pytest.mark.asyncio
async def test_create_quiz(auth_client, test_subject, test_group):
    # Need user_id
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "title": "Math Quiz 1",
        "question_number": 10,
        "duration": 60,
        "pin": "1234",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        # Неактивный тест организатор вправе подготовить заранее, пока лектор ещё
        # грузит вопросы. Проверка достаточности банка привязана к активации —
        # она отдельно покрыта в test_quiz_lecturer_ownership.py.
        "is_active": False,
    }
    response = await auth_client.post("/quiz/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert "id" in data


@pytest.mark.asyncio
async def test_get_quiz(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "title": "Math Quiz Get",
        "question_number": 5,
        "duration": 30,
        "pin": "5678",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
    }
    create_resp = await auth_client.post("/quiz/", json=payload)
    quiz_id = create_resp.json()["id"]

    response = await auth_client.get(f"/quiz/{quiz_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == quiz_id
    assert data["title"] == payload["title"]


@pytest.mark.asyncio
async def test_update_quiz(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "title": "Math Quiz Update",
        "question_number": 5,
        "duration": 30,
        "pin": "9999",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
    }
    create_resp = await auth_client.post("/quiz/", json=payload)
    quiz_id = create_resp.json()["id"]

    payload["title"] = "Updated Math Quiz"
    response = await auth_client.put(f"/quiz/{quiz_id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Math Quiz"


@pytest.mark.asyncio
async def test_delete_quiz(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "title": "Math Quiz Delete",
        "question_number": 5,
        "duration": 30,
        "pin": "0000",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
    }
    create_resp = await auth_client.post("/quiz/", json=payload)
    quiz_id = create_resp.json()["id"]

    response = await auth_client.delete(f"/quiz/{quiz_id}")
    assert response.status_code == 204

    response = await auth_client.get(f"/quiz/{quiz_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_quiz_type_defaults_and_filters(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "title": "Math Quiz Type",
        "question_number": 5,
        "duration": 30,
        "pin": "2468",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
    }
    create_resp = await auth_client.post("/quiz/", json=payload)
    quiz_id = create_resp.json()["id"]

    detail = await auth_client.get(f"/quiz/{quiz_id}")
    assert detail.json()["quiz_type"] == "LESSON_QUIZ"

    empty = await auth_client.get("/quiz/?quiz_type=SEMESTER_FINAL")
    assert empty.status_code == 200
    assert empty.json()["total"] == 0

    matching = await auth_client.get("/quiz/?quiz_type=LESSON_QUIZ")
    assert matching.json()["total"] == 1


@pytest.mark.asyncio
async def test_quiz_type_rejects_unknown_value(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "title": "Math Quiz Bad Type",
        "question_number": 5,
        "duration": 30,
        "pin": "1357",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "quiz_type": "MIDTERM",
    }
    response = await auth_client.post("/quiz/", json=payload)
    assert response.status_code == 422
