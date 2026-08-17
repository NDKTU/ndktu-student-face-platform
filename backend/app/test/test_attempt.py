"""Срок жизни попытки (quiz_process/attempt.py).

Отсчёт ведётся от Result.created_at на сервере, поэтому перезагрузка страницы
не выдаёт студенту полный запас времени заново.
"""

from datetime import timedelta

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.quiz.model import Quiz, Result
from app.modules.quiz.quiz_process.attempt import (
    GRACE_SECONDS,
    deadline,
    grade_for,
    is_expired,
    remaining_seconds,
)


def _attempt(minutes_ago: float, duration: int = 60) -> tuple[Result, Quiz]:
    quiz = Quiz(title="q", question_number=1, duration=duration, pin="1")
    result = Result(status="in_progress")
    result.created_at = utcnow_naive() - timedelta(minutes=minutes_ago)
    return result, quiz


def test_fresh_attempt_is_not_expired():
    result, quiz = _attempt(minutes_ago=0)

    assert not is_expired(result, quiz)
    assert 3595 <= remaining_seconds(result, quiz) <= 3600


def test_remaining_shrinks_with_time():
    result, quiz = _attempt(minutes_ago=25)

    assert 2095 <= remaining_seconds(result, quiz) <= 2100
    assert not is_expired(result, quiz)


def test_grace_period_covers_the_boundary():
    """Последний ответ мог уйти на границе срока и задержаться в сети."""
    result, quiz = _attempt(minutes_ago=60.2)

    assert not is_expired(result, quiz)
    assert GRACE_SECONDS > 0


def test_remaining_never_goes_negative():
    result, quiz = _attempt(minutes_ago=60 * 24)

    assert remaining_seconds(result, quiz) == 0


def test_attempt_expires_past_the_grace_period():
    result, quiz = _attempt(minutes_ago=62)

    assert is_expired(result, quiz)


def test_short_quiz_expires_on_its_own_duration():
    result, quiz = _attempt(minutes_ago=11, duration=10)

    assert is_expired(result, quiz)


def test_deadline_counts_from_creation_not_from_now():
    result, quiz = _attempt(minutes_ago=30, duration=45)

    assert deadline(result, quiz) == result.created_at + timedelta(minutes=45)


def test_grade_thresholds_match_previous_behaviour():
    assert grade_for(10, 10)[0] == 5
    assert grade_for(9, 10)[0] == 5
    assert grade_for(8, 10)[0] == 4
    assert grade_for(6, 10)[0] == 3
    assert grade_for(5, 10)[0] == 2
    assert grade_for(0, 10)[0] == 2


def test_grade_survives_empty_attempt():
    """Попытка без единого вопроса не должна ронять подсчёт делением на ноль."""
    assert grade_for(0, 0) == (2, 0)
