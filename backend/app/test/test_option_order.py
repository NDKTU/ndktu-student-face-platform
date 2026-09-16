"""Проверки расстановки вариантов ответа (quiz_process/option_order.py).

Главное свойство: расстановка выводится из пары (попытка, вопрос), поэтому
submit_answer восстанавливает ровно тот порядок, который start_quiz показал
студенту, — и правильность проверяется по позиции, а не сравнением текстов.

Второе свойство, ради которого здесь лежит `test_shown_order_matches_grading`:
показ и проверка обязаны звать одну и ту же функцию. Пока их было две
(`order_for` для показа и `option_order` для оценки), зёрна отличались на
`:{count}`, порядки расходились и ответ студента записывался на соседний
вариант. Ни один тест этого не ловил, потому что все они проверяли каждую
функцию по отдельности.
"""

import collections
import types

from app.core.enums import QuestionType
from app.modules.quiz.quiz_process.option_order import LETTERS, order_for
from app.modules.quiz.quiz_process.question_view import grade_answer, shown_options


def _question(**kwargs):
    """Минимальный объект вопроса: grade_answer читает только эти поля."""
    defaults = {
        "id": 1,
        "question_type": QuestionType.QUIZ.value,
        "option_a": "A",
        "option_b": "B",
        "option_c": "C",
        "option_d": "D",
        "correct_option": "a",
        "payload": None,
    }
    return types.SimpleNamespace(**{**defaults, **kwargs})


def test_order_is_stable_between_calls():
    """Без этого submit_answer не смог бы восстановить показанную расстановку."""
    assert order_for(101, 55, 4) == order_for(101, 55, 4)


def test_order_is_a_permutation():
    assert sorted(order_for(101, 55, 4)) == list(range(4))


def test_different_questions_get_different_orders():
    orders = {tuple(order_for(101, question_id, 4)) for question_id in range(1, 40)}

    assert len(orders) > 1


def test_different_attempts_get_different_orders():
    """Два студента на одном вопросе видят разную расстановку."""
    orders = {tuple(order_for(result_id, 55, 4)) for result_id in range(1, 40)}

    assert len(orders) > 1


def test_correct_option_does_not_cling_to_a_position():
    """Перекос позиции сделал бы угадывание выгодным."""
    positions = collections.Counter(order_for(result_id, 7, 4).index(0) for result_id in range(1, 3001))

    assert max(positions.values()) - min(positions.values()) < 300


def test_order_handles_any_option_count():
    """Новые типы вопросов приходят с произвольным числом вариантов."""
    for count in range(1, 8):
        assert sorted(order_for(11, 22, count)) == list(range(count))

    assert order_for(11, 22, 0) == []


def test_shown_order_matches_grading():
    """Регрессия: что показано на позиции, то и должно быть засчитано.

    Падал бы на прежнем коде — оценка шла через отдельный `option_order()`
    с другим зерном.
    """
    result_id = 3
    question = _question(id=20, correct_option="a")
    shown = shown_options(result_id, question)

    for position, visible_text in enumerate(shown):
        _, chosen_text, _ = grade_answer(result_id, question, [position])

        assert chosen_text == visible_text, f"позиция {position}: показано {visible_text!r}, засчитано {chosen_text!r}"


def test_grading_marks_the_visible_correct_option():
    """Студент, нажавший на правильный текст, получает верный ответ."""
    result_id = 7
    question = _question(id=31, correct_option="c")
    shown = shown_options(result_id, question)
    position_of_correct = shown.index(question.option_c)

    is_correct, chosen_text, correct_text = grade_answer(result_id, question, [position_of_correct])

    assert is_correct
    assert chosen_text == question.option_c
    assert correct_text == question.option_c


def test_grading_rejects_every_other_position():
    """И наоборот: любая другая позиция считается ошибкой."""
    result_id = 7
    question = _question(id=31, correct_option="c")
    shown = shown_options(result_id, question)
    position_of_correct = shown.index(question.option_c)

    for position in range(len(shown)):
        if position == position_of_correct:
            continue
        is_correct, _, _ = grade_answer(result_id, question, [position])

        assert not is_correct


def test_identical_option_texts_stay_distinguishable():
    """Два варианта с текстом «0»: раньше выбор любого из них засчитывался верным."""
    result_id = 303
    question = _question(id=11, option_a="0", option_b="1", option_c="0", option_d="-1", correct_option="c")
    order = order_for(result_id, question.id, 4)
    position_of_correct = order.index(LETTERS.index("c"))
    position_of_other_zero = order.index(LETTERS.index("a"))

    assert question.option_a == question.option_c  # тексты совпадают

    assert grade_answer(result_id, question, [position_of_correct])[0]
    assert not grade_answer(result_id, question, [position_of_other_zero])[0]


def test_options_differing_only_by_apostrophe_stay_distinguishable():
    """Четыре написания одного узбекского слова — четыре разные строки для ==."""
    result_id = 404
    question = _question(
        id=12,
        option_a="o'quv",
        option_b="o‘quv",
        option_c="o’quv",
        option_d="oʻquv",
        correct_option="b",
    )
    order = order_for(result_id, question.id, 4)
    position_of_correct = order.index(LETTERS.index("b"))

    assert grade_answer(result_id, question, [position_of_correct])[0]
    assert not grade_answer(result_id, question, [order.index(LETTERS.index("a"))])[0]
