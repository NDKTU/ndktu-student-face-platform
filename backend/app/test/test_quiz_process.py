import pytest


@pytest.mark.asyncio
async def test_start_quiz(auth_client, test_subject, test_group, async_db):
    # Setup: Create a quiz and some questions
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    # 1. Create Quiz
    quiz_payload = {
        "title": "Process Quiz",
        "question_number": 2,
        "duration": 60,
        "pin": "1234",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = quiz_resp.json()["id"]

    # 2. Create Questions for the subject
    questions = []
    for i in range(2):
        q_payload = {
            "subject_id": test_subject.id,
            "user_id": user_id,
            "text": f"Question {i}",
            "option_a": "A",
            "option_b": "B",
            "option_c": "C",
            "option_d": "D",
            "correct_option": "a",
        }
        q_resp = await auth_client.post("/question/", json=q_payload)
        questions.append(q_resp.json()["id"])

    # 3. Manually link questions to quiz (since no API for it)
    from app.modules.quiz.quiz.model import QuizQuestion

    for q_id in questions:
        qq = QuizQuestion(quiz_id=quiz_id, question_id=q_id)
        async_db.add(qq)
    await async_db.commit()

    # 4. Start Quiz
    start_payload = {"quiz_id": quiz_id, "pin": "1234"}
    response = await auth_client.post("/quiz_process/start_quiz", json=start_payload)

    assert response.status_code == 200
    data = response.json()
    assert data["quiz_id"] == quiz_id
    assert "result_id" in data
    assert len(data["questions"]) == 2


@pytest.mark.asyncio
async def test_end_quiz(auth_client, test_subject, test_group):
    # Setup
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    quiz_payload = {
        "title": "End Process Quiz",
        "question_number": 1,
        "duration": 60,
        "pin": "5678",
        "user_id": user_id,
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = quiz_resp.json()["id"]

    # Create a question — correct_option explicitly marks which of the 4 options is right.
    q_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "What is A?",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
        "correct_option": "a",
    }
    await auth_client.post("/question/", json=q_payload)

    # Start the attempt — this is what reserves the served questions and creates
    # the Result(status="in_progress") row, replacing the old stateless start_quiz.
    start_resp = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": "5678"})
    assert start_resp.status_code == 200
    start_data = start_resp.json()
    result_id = start_data["result_id"]

    for q in start_data["questions"]:
        submit_resp = await auth_client.post(
            "/quiz_process/submit_answer",
            json={"result_id": result_id, "question_id": q["id"], "answer": "A"},
        )
        assert submit_resp.status_code == 200

    end_payload = {"quiz_id": quiz_id, "result_id": result_id}

    response = await auth_client.post("/quiz_process/end_quiz", json=end_payload)
    assert response.status_code == 200
    data = response.json()
    assert "grade" in data
