import pytest


async def _complete_quiz(auth_client, test_subject, test_group, *, text: str, pin: str, title: str) -> int:
    """Полный актуальный флоу попытки: start_quiz -> submit_answer -> end_quiz.

    Старый stateless end_quiz {quiz_id, user_id, answers} больше не создаёт
    результат: попытка создаётся в start_quiz, ответы отправляются по одному.
    Возвращает quiz_id.
    """
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    # Вопрос — до теста: набор фиксируется при создании теста из банка лектора.
    q_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": text,
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
        "correct_option": "a",
    }
    q_resp = await auth_client.post("/question/", json=q_payload)
    assert q_resp.status_code == 201

    quiz_payload = {
        "title": title,
        "question_number": 1,
        "duration": 60,
        "pin": pin,
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    assert quiz_resp.status_code == 201
    quiz_id = quiz_resp.json()["id"]

    start_resp = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": pin})
    assert start_resp.status_code == 200
    start_data = start_resp.json()
    result_id = start_data["result_id"]

    for q in start_data["questions"]:
        submit_resp = await auth_client.post(
            "/quiz_process/submit_answer",
            json={"result_id": result_id, "question_id": q["id"], "answer": "A"},
        )
        assert submit_resp.status_code == 200

    end_resp = await auth_client.post("/quiz_process/end_quiz", json={"quiz_id": quiz_id, "result_id": result_id})
    assert end_resp.status_code == 200
    return quiz_id


@pytest.mark.asyncio
async def test_list_results(auth_client, test_subject, test_group):
    quiz_id = await _complete_quiz(
        auth_client, test_subject, test_group, text="Result Q1", pin="9988", title="Result Test Quiz"
    )

    response = await auth_client.get("/result/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1

    found = False
    for res in data["results"]:
        if res["quiz_id"] == quiz_id:
            found = True
            break
    assert found


@pytest.mark.asyncio
async def test_get_result(auth_client, test_subject, test_group):
    quiz_id = await _complete_quiz(
        auth_client, test_subject, test_group, text="Result Q2", pin="7766", title="Get Result Quiz"
    )

    list_resp = await auth_client.get(f"/result/?quiz_id={quiz_id}")
    result_id = list_resp.json()["results"][0]["id"]

    response = await auth_client.get(f"/result/{result_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == result_id
    assert data["quiz_id"] == quiz_id


@pytest.mark.asyncio
async def test_delete_result(auth_client, test_subject, test_group):
    quiz_id = await _complete_quiz(
        auth_client, test_subject, test_group, text="Result Q3", pin="5544", title="Delete Result Quiz"
    )

    list_resp = await auth_client.get(f"/result/?quiz_id={quiz_id}")
    result_id = list_resp.json()["results"][0]["id"]

    response = await auth_client.delete(f"/result/{result_id}")
    assert response.status_code == 204

    get_resp = await auth_client.get(f"/result/{result_id}")
    assert get_resp.status_code == 404
