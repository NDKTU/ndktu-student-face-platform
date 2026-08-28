"""Порядок вариантов ответа, показанный конкретному студенту.

Варианты перемешиваются, поэтому буква на экране студента не совпадает с буквой
в базе: показанный «B» может быть ``option_c``. Раньше из-за этого клиент отправлял
не букву, а сам текст варианта, и правильность проверялась сравнением строк —
что ломалось на одинаковых вариантах, на разных видах узбекского апострофа
(``o'`` — U+0027, U+02BB, U+2018, U+2019 выглядят одинаково, но это разные строки)
и на любом HTML внутри варианта.

Здесь порядок не хранится, а **вычисляется заново** из пары (попытка, вопрос).
Так он:

* одинаков в ``start_quiz`` и в ``submit_answer`` — сравнивать тексты больше не нужно;
* переживает возобновление прерванной попытки: студент увидит те же варианты
  в том же порядке, а не новую расстановку;
* не требует ни колонки в базе, ни миграции.

В зерно подмешан серверный секрет: без него студент, знающий ``result_id``,
воспроизвёл бы расстановку у себя. Само по себе это не выдаёт правильный ответ,
но у вопроса ``correct_option`` по умолчанию ``"a"``, поэтому для части вопросов
знание порядка равнялось бы знанию ответа.
"""

import hashlib
import random

from app.core.config import settings

#: Буквы вариантов в том виде, в каком они лежат в колонках questions.
LETTERS = ("a", "b", "c", "d")


def option_order(result_id: int, question_id: int) -> tuple[str, ...]:
    """Возвращает буквы колонок в том порядке, в каком они показаны студенту.

    Результат ``("c", "a", "d", "b")`` читается так: показанный вариант A — это
    ``option_c``, показанный B — ``option_a``, и так далее.
    """
    seed = hashlib.sha256(f"{settings.jwt.access_token_secret}:{result_id}:{question_id}".encode()).hexdigest()

    letters = list(LETTERS)
    # random.Random с фиксированным зерном детерминирован, в отличие от hash():
    # встроенный hash() для строк рандомизируется при каждом запуске процесса.
    random.Random(seed).shuffle(letters)
    return tuple(letters)


def letter_at(result_id: int, question_id: int, position: int) -> str | None:
    """Буква колонки, стоявшая на позиции ``position`` (0–3) у этого студента.

    Возвращает None, если позиция вне диапазона — клиент прислал мусор.
    """
    if not 0 <= position < len(LETTERS):
        return None
    return option_order(result_id, question_id)[position]


def order_for(result_id: int, question_id: int, count: int) -> list[int]:
    """Variantlar o'rinlari, ixtiyoriy soni uchun.

    `option_order` faqat to'rtta ustunli eski savolga mo'ljallangan; yangi
    turlarda variantlar soni har xil. Zerno bir xil usulda yig'iladi,
    shuning uchun tartib urinish davomida o'zgarmaydi.
    """
    if count <= 0:
        return []
    seed = hashlib.sha256(
        f"{settings.jwt.access_token_secret}:{result_id}:{question_id}:{count}".encode()
    ).hexdigest()
    positions = list(range(count))
    random.Random(seed).shuffle(positions)
    return positions
