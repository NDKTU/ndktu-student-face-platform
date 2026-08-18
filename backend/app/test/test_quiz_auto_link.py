import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.modules.quiz.model import QuizQuestion


@pytest_asyncio.fixture
async def setup_questions_and_quiz(auth_client, async_db, test_subject, test_user):
    # 1. Get User ID from test_user fixture
    # test_user fixture returns a dict with username, password, etc.
    # But we need the ID. The 'test_user' fixture creates it but returns payload + modification.
    # We can fetch it via API or just trust the fixture if it returned ID?
    # Let's checkconftest.py...
    # test_user returns data = response.json(). It HAS 'id'.
    user_id = test_user["id"]

    # 2. Create Questions
    # Q1: Matching User & Subject
    q1_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Auto Link Q1",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    q1_resp = await auth_client.post("/question/", json=q1_payload)
    assert q1_resp.status_code == 201
    q1_id = q1_resp.json()["id"]

    # Q2: Matching User & Subject
    q2_payload = {
        "subject_id": test_subject.id,
        "user_id": user_id,
        "text": "Auto Link Q2",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    q2_resp = await auth_client.post("/question/", json=q2_payload)
    q2_id = q2_resp.json()["id"]

    # Q3: Mismatch Subject (User matches)
    # Create another subject
    await auth_client.post("/subject/", json={"name": "Other Subject"})
    from app.modules.quiz.model import Subject

    s2 = Subject(name="Other Subject")
    async_db.add(s2)
    await async_db.commit()
    await async_db.refresh(s2)

    q3_payload = {
        "subject_id": s2.id,
        "user_id": user_id,
        "text": "Mismatch Q3",
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
    }
    q3_resp = await auth_client.post("/question/", json=q3_payload)
    q3_id = q3_resp.json()["id"]

    return {
        "user_id": user_id,
        "subject_id": test_subject.id,
        "q1_id": q1_id,
        "q2_id": q2_id,
        "q3_id": q3_id,
    }


@pytest.mark.asyncio
async def test_auto_link_questions_on_quiz_create(setup_questions_and_quiz, auth_client, async_db):
    data = setup_questions_and_quiz

    # Create Quiz with matching User and Subject
    quiz_payload = {
        "title": "Auto Link Quiz",
        # В банке лектора по этому предмету ровно два подходящих вопроса (Q1 и Q2),
        # а активный тест не может требовать больше, чем есть.
        "question_number": 2,
        "duration": 60,
        "pin": "9999",
        "user_id": data["user_id"],
        "subject_id": data["subject_id"],
        "is_active": True,
    }

    # We use auth_client which is logged in as test_user (same ID as data["user_id"])
    resp = await auth_client.post("/quiz/", json=quiz_payload)
    assert resp.status_code == 201
    quiz_id = resp.json()["id"]

    # Verify links in DB
    stmt = select(func.count()).select_from(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id)
    count_result = await async_db.execute(stmt)
    count = count_result.scalar()

    # Should be 2 (Q1 and Q2)
    assert count == 2

    # Verify specific questions are linked
    stmt_q_ids = select(QuizQuestion.question_id).where(QuizQuestion.quiz_id == quiz_id)
    result_q_ids = await async_db.execute(stmt_q_ids)
    linked_q_ids = result_q_ids.scalars().all()

    assert data["q1_id"] in linked_q_ids
    assert data["q2_id"] in linked_q_ids
    assert data["q3_id"] not in linked_q_ids
