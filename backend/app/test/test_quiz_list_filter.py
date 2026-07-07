import pytest
import pytest_asyncio

from app.modules.quiz.model import Quiz


@pytest_asyncio.fixture
async def setup_quizzes_for_filter(async_db, test_user, test_subject, test_group):
    # Create Active Quiz
    active_quiz = Quiz(
        title="Active Quiz",
        question_number=5,
        duration=60,
        pin="1111",
        is_active=True,
        user_id=test_user["id"],
        subject_id=test_subject.id,
        group_id=test_group["id"],
    )
    async_db.add(active_quiz)

    # Create Inactive Quiz
    inactive_quiz = Quiz(
        title="Inactive Quiz",
        question_number=5,
        duration=60,
        pin="2222",
        is_active=False,
        user_id=test_user["id"],
        subject_id=test_subject.id,
        group_id=test_group["id"],
    )
    async_db.add(inactive_quiz)

    await async_db.commit()
    await async_db.refresh(active_quiz)
    await async_db.refresh(inactive_quiz)

    return active_quiz, inactive_quiz


@pytest.mark.asyncio
async def test_quiz_list_filter_is_active(auth_client, setup_quizzes_for_filter):
    active_quiz, inactive_quiz = setup_quizzes_for_filter

    # 1. Filter by is_active=True
    resp_true = await auth_client.get("/quiz/", params={"is_active": True})
    assert resp_true.status_code == 200
    data_true = resp_true.json()
    titles_true = [q["title"] for q in data_true["quizzes"]]
    assert "Active Quiz" in titles_true
    assert "Inactive Quiz" not in titles_true

    # 2. Filter by is_active=False
    resp_false = await auth_client.get("/quiz/", params={"is_active": False})
    assert resp_false.status_code == 200
    data_false = resp_false.json()
    titles_false = [q["title"] for q in data_false["quizzes"]]
    assert "Inactive Quiz" in titles_false
    assert "Active Quiz" not in titles_false

    # 3. No filter (should return both, depending on pagination/other filters, but let's assume they show up)
    # Actually, default behavior might be specific, but if is_active is None, it returns all.
    # Note: The test environment might have other quizzes, so we just check existence.
    resp_all = await auth_client.get("/quiz/")
    assert resp_all.status_code == 200
    data_all = resp_all.json()
    titles_all = [q["title"] for q in data_all["quizzes"]]
    assert "Active Quiz" in titles_all
    assert "Inactive Quiz" in titles_all
