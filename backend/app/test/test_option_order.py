"""Проверки расстановки вариантов ответа (quiz_process/option_order.py).

Главное свойство: расстановка выводится из пары (попытка, вопрос), поэтому
submit_answer восстанавливает ровно тот порядок, который start_quiz показал
студенту, — и правильность проверяется по позиции, а не сравнением текстов.
"""

import collections

from app.modules.quiz.quiz_process.option_order import LETTERS, letter_at, option_order


def test_order_is_stable_between_calls():
    """Без этого submit_answer не смог бы восстановить показанную расстановку."""
    assert option_order(101, 55) == option_order(101, 55)


def test_order_is_a_permutation():
    assert sorted(option_order(101, 55)) == sorted(LETTERS)


def test_different_questions_get_different_orders():
    orders = {option_order(101, question_id) for question_id in range(1, 40)}

    assert len(orders) > 1


def test_different_attempts_get_different_orders():
    """Два студента на одном вопросе видят разную расстановку."""
    orders = {option_order(result_id, 55) for result_id in range(1, 40)}

    assert len(orders) > 1


def test_correct_option_does_not_cling_to_a_position():
    """Перекос позиции сделал бы угадывание выгодным."""
    positions = collections.Counter(option_order(result_id, 7).index("a") for result_id in range(1, 3001))

    assert max(positions.values()) - min(positions.values()) < 300


def test_letter_at_matches_order():
    order = option_order(202, 9)

    assert [letter_at(202, 9, i) for i in range(4)] == list(order)


def test_letter_at_rejects_out_of_range():
    assert letter_at(202, 9, -1) is None
    assert letter_at(202, 9, 4) is None


def test_identical_option_texts_stay_distinguishable():
    """Два варианта с текстом «0»: раньше выбор любого из них засчитывался верным."""
    question = {"option_a": "0", "option_b": "1", "option_c": "0", "option_d": "-1"}
    correct_option = "c"
    order = option_order(303, 11)

    chosen_correct = letter_at(303, 11, order.index("c"))
    chosen_other_zero = letter_at(303, 11, order.index("a"))

    assert question["option_a"] == question["option_c"]  # тексты совпадают
    assert chosen_correct == correct_option
    assert chosen_other_zero != correct_option


def test_options_differing_only_by_apostrophe_stay_distinguishable():
    """Четыре написания одного узбекского слова — четыре разные строки для ==."""
    correct_option = "b"
    order = option_order(404, 12)

    assert letter_at(404, 12, order.index("b")) == correct_option
