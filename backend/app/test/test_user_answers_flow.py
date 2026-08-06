import pytest
from sqlalchemy import select

from app.modules.auth.user.model import User
from app.modules.quiz.question.model import Question
from app.modules.quiz.quiz.model import Quiz, QuizQuestion
from app.modules.quiz.subject.model import Subject
from app.modules.quiz.user_answers.model import UserAnswers


@pytest.mark.asyncio
async def test_user_answers_flow(auth_client, async_db):
    # 1. Setup Data
    # Create Subject
    subject = Subject(name="Test Subject")
    async_db.add(subject)
    await async_db.commit()
    await async_db.refresh(subject)

    # Fetch User (created by auth_client fixture)
    stmt = select(User).where(User.username == "test_user")
    result = await async_db.execute(stmt)
    user = result.scalar_one()

    # Create Question — correct_option marks "4" (option_a) as the right answer.
    question = Question(
        text="What is 2+2?",
        option_a="4",
        option_b="3",
        option_c="5",
        option_d="6",
        correct_option="a",
        subject_id=subject.id,
        user_id=user.id,
    )
    async_db.add(question)
    await async_db.commit()
    await async_db.refresh(question)

    # Create Quiz
    quiz = Quiz(
        title="Test Quiz",
        subject_id=subject.id,
        question_number=1,
        duration=10,
        is_active=True,
        pin="1234",
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)

    # Link Question to Quiz
    quiz_question = QuizQuestion(quiz_id=quiz.id, question_id=question.id)
    async_db.add(quiz_question)
    await async_db.commit()

    # 2. Start Quiz — this now creates the Result(status="in_progress") attempt
    # and reserves a UserAnswers row per served question.
    start_response = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz.id, "pin": "1234"})
    assert start_response.status_code == 200
    data = start_response.json()
    assert len(data["questions"]) == 1
    question_dto = data["questions"][0]
    result_id = data["result_id"]

    # 3. Submit the answer for that question, then end the quiz
    submit_response = await auth_client.post(
        "/quiz_process/submit_answer",
        json={"result_id": result_id, "question_id": question_dto["id"], "answer": "4"},
    )
    assert submit_response.status_code == 200
    assert submit_response.json()["is_correct"] is True

    end_response = await auth_client.post(
        "/quiz_process/end_quiz", json={"quiz_id": quiz.id, "result_id": result_id}
    )
    assert end_response.status_code == 200
    end_data = end_response.json()
    assert end_data["correct_answers"] == 1

    # 4. Verify UserAnswers in DB
    stmt = select(UserAnswers).where(UserAnswers.quiz_id == quiz.id)
    result = await async_db.execute(stmt)
    user_answers = result.scalars().all()

    assert len(user_answers) == 1
    assert user_answers[0].answer == "4"
    assert user_answers[0].is_correct is True

    # 5. Verify via API
    api_response = await auth_client.get("/user_answers/", params={"result_id": result_id})
    assert api_response.status_code == 200
    api_data = api_response.json()

    # Filter for our specific answer in case other tests run
    found = False
    for item in api_data["answers"]:
        if item["quiz_id"] == quiz.id and item["question_id"] == question_dto["id"]:
            assert item["answer"] == "4"
            assert item["is_correct"] is True
            found = True
            break

    assert found
