import pytest
import pytest_asyncio

from app.modules.quiz.model import QuizQuestion


@pytest_asyncio.fixture
async def setup_quiz_execution(auth_client, async_db, test_subject, test_user):
    user_id = test_user["id"]

    # 1. Create Quiz
    quiz_payload = {
        "title": "Reproduction Quiz",
        "question_number": 5,
        "duration": 60,
        "pin": "1234",
        "user_id": user_id,
        "subject_id": test_subject.id,
        "is_active": True,
    }
    resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = resp.json()["id"]

    # 2. Add Questions (Auto-link should happen, but let's ensure we have questions)
    # If auto-link worked in previous test, great. If not, let's create questions now
    # that match the quiz subject/user if that's required, OR just manually link if needed?
    # The auto-link logic is: matching user_id & subject_id.

    # Create matching question 1
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

    # We need to manually link it if it wasn't auto-linked (created AFTER quiz)
    # Auto-link only happens on quiz creation.
    # So we must link manually or create questions BEFORE quiz.
    # Actually, let's create a new question and manually link it to be sure.
    qq = QuizQuestion(quiz_id=quiz_id, question_id=q1_id)
    async_db.add(qq)
    await async_db.commit()

    return {"quiz_id": quiz_id, "q1_id": q1_id, "user_id": user_id}


@pytest.mark.asyncio
async def test_end_quiz_error_reproduction(setup_quiz_execution, auth_client):
    data = setup_quiz_execution

    # start_quiz creates the attempt (Result) and reserves the served questions —
    # end_quiz can only finalize an attempt that was actually started.
    start_resp = await auth_client.post(
        "/quiz_process/start_quiz", json={"quiz_id": data["quiz_id"], "pin": "1234"}
    )
    assert start_resp.status_code == 200
    result_id = start_resp.json()["result_id"]

    submit_resp = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": result_id, "question_id": data["q1_id"], "answer": "Option A"},
    )
    assert submit_resp.status_code == 200

    resp = await auth_client.post(
        "/quiz_process/end_quiz", json={"quiz_id": data["quiz_id"], "result_id": result_id}
    )

    # We expect this to SUCCEED with 200 now
    print(resp.json())
    assert resp.status_code == 200
    assert "grade" in resp.json()
