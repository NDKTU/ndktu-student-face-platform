"""Порядок вариантов ответа, показанный конкретному студенту.

Варианты перемешиваются, поэтому позиция на экране студента не совпадает с
позицией в базе: показанный «B» может быть ``option_c``. Раньше из-за этого
клиент отправлял не позицию, а сам текст варианта, и правильность проверялась
сравнением строк — что ломалось на одинаковых вариантах, на разных видах
узбекского апострофа (``o'`` — U+0027, U+02BB, U+2018, U+2019 выглядят
одинаково, но это разные строки) и на любом HTML внутри варианта.

Порядок задаёт **одна** функция — :func:`order_for`. Показ и проверка обязаны
звать именно её: две независимые реализации однажды уже разошлись по зерну и
молча записывали студенту соседний вариант.

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


def order_for(result_id: int, question_id: int, count: int) -> list[int]:
    """Variantlarning ko'rsatiladigan tartibi — barcha savol turlari uchun yagona.

    Natija ``[2, 0, 1, 3]`` shunday o'qiladi: ekrandagi birinchi variant — asl
    ro'yxatning 2-elementi, ikkinchisi — 0-elementi va hokazo.

    Bu yagona manba: ko'rsatish ham (`shown_options`), baholash ham
    (`grade_answer`) shu funksiyani chaqiradi. Ilgari baholash uchun alohida
    `option_order()` bor edi — zerno satri `:{count}` bilan farq qilgani uchun
    u boshqa tartib berardi va talabaning javobi qo'shni variantga yozilardi.
    """
    if count <= 0:
        return []
    seed = hashlib.sha256(
        f"{settings.jwt.access_token_secret}:{result_id}:{question_id}:{count}".encode()
    ).hexdigest()
    positions = list(range(count))
    # random.Random с фиксированным зерном детерминирован, в отличие от hash():
    # встроенный hash() для строк рандомизируется при каждом запуске процесса.
    random.Random(seed).shuffle(positions)
    return positions
