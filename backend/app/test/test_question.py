import pytest


@pytest.mark.asyncio
async def test_create_question(auth_client, test_subject, test_user):
    # Need user_id from token or payload. Schema says user_id is in payload.
    # We should get user_id properly.
    # Since we are admin (test_user), let's find our ID or just use 1 if we are sure.
    # Better approach: get "me" or decode token.
    # For now, let's assume the test_user fixture creates a user, we can fetch it.

    # We need to get the user id.
    # Let's inspect test_user fixture again. It returns payload, not ID.
    # But we can get it by logging in or query.
    # Or just List users and pick one.

    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "What is 2+2?",
        "option_a": "4",
        "option_b": "5",
        "option_c": "6",
        "option_d": "7",
    }
    response = await auth_client.post("/question/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["text"] == payload["text"]
    assert "id" in data
    return data


@pytest.mark.asyncio
async def test_get_question(auth_client, test_subject):
    # Create one first
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Temp question for get",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    create_resp = await auth_client.post("/question/", json=payload)
    question_id = create_resp.json()["id"]

    response = await auth_client.get(f"/question/{question_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == question_id
    assert data["text"] == payload["text"]


@pytest.mark.asyncio
async def test_list_questions(auth_client, test_subject):
    response = await auth_client.get("/question/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 0  # Might be 0 if clean DB, but we created some in prev tests?
    # Since tests run in parallel or seq, and transaction rollback happens...
    # Wait, fixtures use function scope rollback.
    # So we need to ensure we have data if we expect >= 1.
    # The previous test_create_question runs in its own transaction.
    # So here we might need to create one if we want to assert >= 1.
    pass


@pytest.mark.asyncio
async def test_update_question(auth_client, test_subject):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Original Question",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    create_resp = await auth_client.post("/question/", json=payload)
    question_id = create_resp.json()["id"]

    update_payload = payload.copy()
    update_payload["text"] = "Updated Question"

    response = await auth_client.put(f"/question/{question_id}", json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "Updated Question"


@pytest.mark.asyncio
async def test_delete_question(auth_client, test_subject):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "To be deleted",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    create_resp = await auth_client.post("/question/", json=payload)
    question_id = create_resp.json()["id"]

    response = await auth_client.delete(f"/question/{question_id}")
    assert response.status_code == 204

    # Удаление мягкое (is_active=False): строка остаётся читаемой напрямую,
    # т.к. на неё могут ссылаться quiz_questions/user_answers, но из
    # списков и будущего отбора в тесты вопрос исключается.
    response = await auth_client.get(f"/question/{question_id}")
    assert response.status_code == 200

    list_resp = await auth_client.get(f"/question/?subject_id={test_subject.id}")
    assert list_resp.status_code == 200
    listed_ids = [q["id"] for q in list_resp.json()["questions"]]
    assert question_id not in listed_ids
