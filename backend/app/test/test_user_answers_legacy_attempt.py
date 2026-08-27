"""Разбор одной попытки, когда у ответов не проставлен ``result_id``.

Регрессия: ``result_id`` появился позже самих ответов, и у всех записей,
восстановленных из старых дампов, он пуст. Строгий фильтр по ``result_id``
отдавал для такой попытки пустой список — экран «Javoblar tafsiloti»
показывал «Javoblar topilmadi», хотя тот же URL без ``result_id`` открывался
нормально и показывал все 25 вопросов.

Второй тест важен не меньше первого: возврат к паре (user_id, quiz_id) без
ограничения по времени свалил бы в одну попытку ответы обеих, и студент,
проходивший тест дважды, увидел бы удвоенный список.
"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio

from app.modules.auth.model import User
from app.modules.quiz.model import Quiz, Result, Subject, UserAnswers
from app.modules.quiz.user_answers.repository import user_answers_repository
from app.modules.quiz.user_answers.schemas import UserAnswersListRequest


@pytest_asyncio.fixture
async def legacy_attempts(async_db):
    """Две попытки одного теста, ответы — без ``result_id``, как в старых дампах."""
    user = User(username="legacy_student", password="hashed")
    subject = Subject(name="Legacy fan")
    async_db.add_all([user, subject])
    await async_db.flush()

    quiz = Quiz(
        lecturer_id=user.id,
        subject_id=subject.id,
        title="Legacy test",
        question_number=2,
        duration=30,
        pin="1234",
        is_active=False,
    )
    async_db.add(quiz)
    await async_db.flush()

    first_at = datetime(2026, 4, 17, 8, 51, 59)
    second_at = first_at + timedelta(days=3)

    attempts = []
    for started in (first_at, second_at):
        attempt = Result(
            user_id=user.id,
            quiz_id=quiz.id,
            subject_id=subject.id,
            correct_answers=1,
            wrong_answers=1,
            grade=3,
            status="completed",
            created_at=started,
            updated_at=started,
            finished_at=started,
        )
        async_db.add(attempt)
        await async_db.flush()
        attempts.append(attempt)

        for is_correct in (True, False):
            async_db.add(
                UserAnswers(
                    user_id=user.id,
                    quiz_id=quiz.id,
                    answer="a",
                    is_correct=is_correct,
                    result_id=None,          # ключ регрессии: связи с попыткой нет
                    created_at=started,
                    updated_at=started,
                )
            )
    await async_db.flush()
    return attempts


@pytest.mark.asyncio
async def test_attempt_without_result_id_still_returns_answers(async_db, legacy_attempts):
    """Запрос по ``result_id`` находит ответы, не связанные с попыткой напрямую."""
    request = UserAnswersListRequest(result_id=legacy_attempts[0].id, page=1, limit=50)

    response = await user_answers_repository.get_all(async_db, request)

    assert response.total == 2


@pytest.mark.asyncio
async def test_two_attempts_do_not_bleed_into_each_other(async_db, legacy_attempts):
    """Каждая попытка отдаёт только свои ответы, а не сумму обеих."""
    totals = []
    for attempt in legacy_attempts:
        request = UserAnswersListRequest(result_id=attempt.id, page=1, limit=50)
        totals.append((await user_answers_repository.get_all(async_db, request)).total)

    assert totals == [2, 2]


@pytest.mark.asyncio
async def test_missing_attempt_returns_nothing(async_db, legacy_attempts):
    """Несуществующая попытка не должна превращаться в «все ответы подряд»."""
    request = UserAnswersListRequest(result_id=999_999, page=1, limit=50)

    response = await user_answers_repository.get_all(async_db, request)

    assert response.total == 0
