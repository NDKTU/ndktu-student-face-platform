"""Студент видит разбор только своих ответов.

Право ``user_answers:read`` выдано роли ``student`` (миграция c7e1a9d4b283),
без него кнопка «Javoblarni ko'rish» никуда не вела. Но эндпоинт принимает
``user_id`` и ``result_id`` из query, поэтому одного права мало: без сужения
выборки любой студент открыл бы чужую работу, поменяв id в адресе.

Преподаватель и администратор разбирают чужие попытки по роли — это их работа,
поэтому сужение к ним не применяется.
"""

import pytest
import pytest_asyncio

from app.modules.auth.model import Role, User
from app.modules.quiz.model import Quiz, Subject, UserAnswers
from app.modules.quiz.user_answers.repository import user_answers_repository
from app.modules.quiz.user_answers.schemas import UserAnswersListRequest


@pytest_asyncio.fixture
async def two_students(async_db):
    """Два студента с ответами на один и тот же тест."""
    student_role = Role(name="Student")
    teacher_role = Role(name="Teacher")
    async_db.add_all([student_role, teacher_role])

    # Роли задаются в конструкторе: у нового объекта коллекция инициализируется
    # сразу, а `.roles.append(...)` после flush ушёл бы в ленивую загрузку и
    # упал MissingGreenlet в асинхронной сессии.
    owner = User(username="answers_owner", password="hashed", roles=[student_role])
    stranger = User(username="answers_stranger", password="hashed", roles=[student_role])
    teacher = User(username="answers_teacher", password="hashed", roles=[teacher_role])
    async_db.add_all([owner, stranger, teacher])
    await async_db.flush()

    subject = Subject(name="Access fan")
    async_db.add(subject)
    await async_db.flush()

    quiz = Quiz(
        lecturer_id=teacher.id,
        subject_id=subject.id,
        title="Access test",
        question_number=1,
        duration=10,
        pin="4321",
        is_active=False,
    )
    async_db.add(quiz)
    await async_db.flush()

    for user in (owner, stranger):
        async_db.add(UserAnswers(user_id=user.id, quiz_id=quiz.id, answer="a", is_correct=True))
    await async_db.flush()
    return {"owner": owner, "stranger": stranger, "teacher": teacher, "quiz": quiz}


@pytest.mark.asyncio
async def test_student_sees_own_answers(async_db, two_students):
    owner, quiz = two_students["owner"], two_students["quiz"]
    request = UserAnswersListRequest(user_id=owner.id, quiz_id=quiz.id, page=1, limit=50)

    response = await user_answers_repository.get_all(async_db, request, owner)

    assert response.total == 1


@pytest.mark.asyncio
async def test_student_cannot_read_someone_elses_answers(async_db, two_students):
    """Чужой user_id в запросе не должен открывать чужую работу."""
    owner, stranger, quiz = two_students["owner"], two_students["stranger"], two_students["quiz"]
    request = UserAnswersListRequest(user_id=stranger.id, quiz_id=quiz.id, page=1, limit=50)

    response = await user_answers_repository.get_all(async_db, request, owner)

    assert response.total == 0


@pytest.mark.asyncio
async def test_teacher_sees_any_student(async_db, two_students):
    """Преподавателю сужение не применяется — он разбирает работы студентов."""
    teacher, stranger, quiz = two_students["teacher"], two_students["stranger"], two_students["quiz"]
    request = UserAnswersListRequest(user_id=stranger.id, quiz_id=quiz.id, page=1, limit=50)

    response = await user_answers_repository.get_all(async_db, request, teacher)

    assert response.total == 1
