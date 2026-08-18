import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def setup_quiz_execution(auth_client, test_subject, test_user):
    user_id = test_user["id"]

    # 1. Наполняем банк лектора. Порядок важен: тест собирает вопросы из банка
    #    в момент создания, поэтому вопрос должен существовать раньше теста —
    #    иначе тест останется пустым и активация вернёт 409.
    q1_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Q1",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
        "correct_option": "a",
    }
    q1_resp = await auth_client.post("/question/", json=q1_payload)
    q1_id = q1_resp.json()["id"]

    # 2. Create Quiz — вопрос подцепляется автоматически, руками связывать не нужно.
    #    question_number совпадает с размером банка: активный тест не может требовать
    #    больше вопросов, чем есть.
    quiz_payload = {
        "title": "Reproduction Quiz",
        "question_number": 1,
        "duration": 60,
        "pin": "1234",
        "user_id": user_id,
        "subject_id": test_subject.id,
        "is_active": True,
    }
    resp = await auth_client.post("/quiz/", json=quiz_payload)
    assert resp.status_code == 201
    quiz_id = resp.json()["id"]

    return {"quiz_id": quiz_id, "q1_id": q1_id, "user_id": user_id}


@pytest.mark.asyncio
async def test_end_quiz_error_reproduction(setup_quiz_execution, auth_client):
    data = setup_quiz_execution

    # start_quiz creates the attempt (Result) and reserves the served questions —
    # end_quiz can only finalize an attempt that was actually started.
    start_resp = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": data["quiz_id"], "pin": "1234"})
    assert start_resp.status_code == 200
    result_id = start_resp.json()["result_id"]

    submit_resp = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": result_id, "question_id": data["q1_id"], "answer": "Option A"},
    )
    assert submit_resp.status_code == 200

    resp = await auth_client.post("/quiz_process/end_quiz", json={"quiz_id": data["quiz_id"], "result_id": result_id})

    # We expect this to SUCCEED with 200 now
    print(resp.json())
    assert resp.status_code == 200
    assert "grade" in resp.json()
