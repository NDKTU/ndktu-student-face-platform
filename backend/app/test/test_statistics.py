import pytest

from app.modules.quiz.models.quiz import Quiz
from app.modules.result.model import Result


@pytest.mark.asyncio
async def test_statistics_endpoints(
    auth_client,
    async_db,
    test_user,
    test_subject,
    test_group,
    test_kafedra,
    test_teacher,
):
    # Setup data hierarchy:
    # 1. Teacher (test_teacher) belongs to Kafedra (test_kafedra)
    # 2. Quiz created by User (test_user), who is linked to the Teacher

    # Use the user linked to the teacher for quiz creation
    teacher_user_id = test_teacher["employee"]["user_id"]

    # Create Quiz
    quiz = Quiz(
        title="Stats Quiz",
        question_number=5,
        duration=30,
        pin="9999",
        is_active=True,
        user_id=teacher_user_id,
        group_id=test_group["id"],
        subject_id=test_subject.id,
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)

    # Create Results
    # Result 1: Grade 80
    r1 = Result(
        user_id=test_user["id"],
        quiz_id=quiz.id,
        subject_id=test_subject.id,
        group_id=test_group["id"],
        correct_answers=4,
        wrong_answers=1,
        grade=80,
    )
    # Result 2: Grade 100
    r2 = Result(
        user_id=test_user["id"],  # Same user for simplicity
        quiz_id=quiz.id,
        subject_id=test_subject.id,
        group_id=test_group["id"],
        correct_answers=5,
        wrong_answers=0,
        grade=100,
    )
    async_db.add(r1)
    async_db.add(r2)
    await async_db.commit()

    # Verify Group Stats
    resp = await auth_client.get(f"/statistics/group/{test_group['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["group_id"] == test_group["id"]
    assert data["total_quizzes_taken"] == 2
    assert data["average_grade"] == 90.0

    # Verify Teacher Stats
    # Teacher ID comes from fixture response
    teacher_id = test_teacher["id"]
    resp = await auth_client.get(f"/statistics/teacher/{teacher_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["teacher_id"] == teacher_id
    assert data["total_results"] == 2
    assert data["total_quizzes_created"] == 1
    assert data["average_grade"] == 90.0

    # Verify Faculty Stats
    faculty_id = test_group["faculty_id"]  # Group belongs to faculty
    resp = await auth_client.get(f"/statistics/faculty/{faculty_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["faculty_id"] == faculty_id
    assert data["total_quizzes_taken"] == 2  # total results
    assert data["average_grade"] == 90.0

    # Verify Groups breakdown
    assert "groups" in data
    assert len(data["groups"]) == 1
    group_stat = data["groups"][0]
    assert group_stat["group_id"] == test_group["id"]
    assert group_stat["name"] == test_group["name"]
    assert group_stat["total_quizzes_taken"] == 2
    assert group_stat["average_grade"] == 90.0
