"""Время жизни попытки и перевод результата в оценку.

Отсчёт времени раньше вёл браузер: сервер отдавал ``duration``, а клиент считал
сам. Перезагрузка страницы давала полный запас времени заново. Здесь срок
попытки выводится из ``Result.created_at`` — момента, когда попытка была создана
на сервере, — поэтому F5, второй компьютер и переустановка браузера ничего
не меняют.

``created_at`` хранится как наивный UTC (см. core/mixins/time_stamp_mixin),
поэтому сравнивать его нужно только с ``utcnow_naive()``.
"""

from datetime import datetime, timedelta

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.quiz.model import Quiz, Result

#: Запас поверх длительности теста. Последний ответ студента мог уйти на границе
#: срока и задержаться в сети; без запаса он бы пропал уже после успешной отправки.
GRACE_SECONDS = 60


def deadline(result: Result, quiz: Quiz) -> datetime:
    """Момент, после которого попытка считается истёкшей (без учёта запаса)."""
    return result.created_at + timedelta(minutes=quiz.duration)


def remaining_seconds(result: Result, quiz: Quiz) -> int:
    """Сколько секунд осталось студенту. Никогда не отрицательно."""
    left = (deadline(result, quiz) - utcnow_naive()).total_seconds()
    return max(0, int(left))


def is_expired(result: Result, quiz: Quiz) -> bool:
    """Истекла ли попытка с учётом запаса на сетевые задержки."""
    return utcnow_naive() > deadline(result, quiz) + timedelta(seconds=GRACE_SECONDS)


def grade_for(correct: int, total: int) -> tuple[int, float]:
    """Оценка и процент по числу верных ответов.

    Пороги совпадают с прежним поведением end_quiz. Вынесены сюда, чтобы
    автоматическое закрытие истёкшей попытки считало ровно так же, как обычное
    завершение, — иначе оценка зависела бы от того, нажал студент «Завершить»
    или у него кончилось время.
    """
    percentage = (correct / total * 100) if total > 0 else 0

    if percentage >= 86:
        grade = 5
    elif percentage >= 72:
        grade = 4
    elif percentage >= 56:
        grade = 3
    else:
        grade = 2

    return grade, percentage
