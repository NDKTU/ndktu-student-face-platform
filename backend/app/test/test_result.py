import pytest


@pytest.mark.asyncio
async def test_list_results(auth_client, test_subject, test_group):
    # Setup: Create quiz and complete it to generate a result
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    # 1. Create Question — банк лектора наполняется до создания теста: активный
    #    тест не может требовать больше вопросов, чем есть в банке.
    q_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Result Q1",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    q_resp = await auth_client.post("/question/", json=q_payload)
    q_id = q_resp.json()["id"]

    # 2. Create Quiz
    quiz_payload = {
        "title": "Result Test Quiz",
        "question_number": 1,
        "duration": 60,
        "pin": "9988",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = quiz_resp.json()["id"]

    # 3. End Quiz (creates result)
    end_payload = {
        "quiz_id": quiz_id,
        "user_id": user_id,
        "answers": [{"question_id": q_id, "answer": "A"}],
    }
    await auth_client.post("/quiz_process/end_quiz", json=end_payload)

    # 4. List Results
    response = await auth_client.get("/result/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1

    # Verify result details
    # We expect at least one result with our quiz_id
    found = False
    result_id = None
    for res in data["results"]:
        if res["quiz_id"] == quiz_id:
            found = True
            result_id = res["id"]
            break
    assert found
    return result_id


@pytest.mark.asyncio
async def test_get_result(auth_client, test_subject, test_group):
    # Reuse flow or create new
    # For simplicity, let's just rely on the fact that previous tests might have created results or we create one here.
    # To be isolated, we create one.

    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    # Вопрос — до теста: набор фиксируется при создании теста из банка лектора.
    q_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Result Q2",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    q_resp = await auth_client.post("/question/", json=q_payload)
    q_id = q_resp.json()["id"]

    quiz_payload = {
        "title": "Get Result Quiz",
        "question_number": 1,
        "duration": 60,
        "pin": "7766",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = quiz_resp.json()["id"]

    end_payload = {
        "quiz_id": quiz_id,
        "user_id": user_id,
        "answers": [{"question_id": q_id, "answer": "A"}],
    }
    await auth_client.post("/quiz_process/end_quiz", json=end_payload)

    # Get Result ID from list (since create doesn't return ID directly in API response? EndQuizResponse has grade etc but no ID?)
    # EndQuizResponse: total_questions, correct_answers, wrong_answers, grade. No ID.
    # So we must list to find it.

    list_resp = await auth_client.get(f"/result/?quiz_id={quiz_id}")
    result_id = list_resp.json()["results"][0]["id"]

    # Test GET
    response = await auth_client.get(f"/result/{result_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == result_id
    assert data["quiz_id"] == quiz_id


@pytest.mark.asyncio
async def test_delete_result(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    # Вопрос — до теста: набор фиксируется при создании теста из банка лектора.
    q_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Result Q3",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    q_resp = await auth_client.post("/question/", json=q_payload)
    q_id = q_resp.json()["id"]

    quiz_payload = {
        "title": "Delete Result Quiz",
        "question_number": 1,
        "duration": 60,
        "pin": "5544",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = quiz_resp.json()["id"]

    end_payload = {
        "quiz_id": quiz_id,
        "user_id": user_id,
        "answers": [{"question_id": q_id, "answer": "A"}],
    }
    await auth_client.post("/quiz_process/end_quiz", json=end_payload)

    list_resp = await auth_client.get(f"/result/?quiz_id={quiz_id}")
    result_id = list_resp.json()["results"][0]["id"]

    # Delete
    response = await auth_client.delete(f"/result/{result_id}")
    assert response.status_code == 204

    # Verify deletion
    response = await auth_client.get(f"/result/{result_id}")
    assert response.status_code == 404
