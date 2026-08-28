"""Savolni talabaga ko'rsatish va javobini tekshirish — tur bo'yicha.

Bitta joyda turgani muhim: `start_quiz`, urinishni tiklash va ochiq test
bir xil tartibni ko'rsatishi, `submit_answer` esa aynan o'sha tartib
bo'yicha tekshirishi kerak. Ilgari bu mantiq faqat `QUIZ` uchun bo'lgan va
`repository.py` ichida yotgan edi.
"""

import re
import unicodedata

from app.core.enums import QuestionType
from app.modules.quiz.model import Question

from .option_order import option_order, order_for
from .schemas import QuestionDTO

# Ko'rsatiladigan matn: talaba «To'g'ri»/«Noto'g'ri» ni ko'radi, bazada esa
# mantiqiy qiymat turadi.
TRUE_FALSE_OPTIONS = ("To'g'ri", "Noto'g'ri")

# O'zbekchada bir xil ko'rinadigan, lekin turli belgilar: o'qituvchi va
# talaba ularni turlicha yozadi, javob esa bir xil hisoblanishi kerak.
_APOSTROPHES = dict.fromkeys(map(ord, "'\u02bb\u02bc\u2018\u2019\u0060\u00b4"), "'")


def normalize_text_answer(value: str) -> str:
    """Matnli javobni solishtirishga tayyorlaydi.

    Registr, ortiqcha bo'sh joy va apostrof turi javobning mazmuniga
    ta'sir qilmaydi — shuning uchun ular olib tashlanadi.
    """
    text = unicodedata.normalize("NFKC", value or "").strip().lower()
    text = text.translate(_APOSTROPHES)
    return re.sub(r"\s+", " ", text)


def question_options(question: Question) -> list[str]:
    """Savolning variantlari — aralashtirilmagan, «tabiiy» tartibda."""
    if question.question_type == QuestionType.TRUE_FALSE.value:
        return list(TRUE_FALSE_OPTIONS)
    if question.question_type == QuestionType.MULTI_SELECT.value:
        return list((question.payload or {}).get("options") or [])
    if question.question_type == QuestionType.PUZZLE.value:
        # To'g'ri tartib — aynan shu ro'yxat tartibi.
        return list((question.payload or {}).get("items") or [])
    if question.question_type == QuestionType.TYPE_ANSWER.value:
        # Variant yo'q: talaba javobni o'zi yozadi.
        return []
    return [question.option_a, question.option_b, question.option_c, question.option_d]


def shown_options(result_id: int, question: Question) -> list[str]:
    """Variantlar aynan shu urinishda ko'rsatiladigan tartibda.

    `TRUE_FALSE` aralashtirilmaydi: «To'g'ri/Noto'g'ri» ni joyini almashtirish
    faqat chalg'itadi.
    """
    options = question_options(question)
    if question.question_type == QuestionType.TRUE_FALSE.value:
        return options
    order = order_for(result_id, question.id, len(options))
    return [options[index] for index in order]


def to_dto(result_id: int, question: Question) -> QuestionDTO:
    options = shown_options(result_id, question)
    is_quiz = question.question_type == QuestionType.QUIZ.value
    return QuestionDTO(
        id=question.id,
        text=question.text,
        # Eski mijoz uchun — faqat klassik savolda.
        option_a=options[0] if is_quiz and len(options) > 0 else "",
        option_b=options[1] if is_quiz and len(options) > 1 else "",
        option_c=options[2] if is_quiz and len(options) > 2 else "",
        option_d=options[3] if is_quiz and len(options) > 3 else "",
        question_type=question.question_type,
        options=options,
        multiple=question.question_type == QuestionType.MULTI_SELECT.value,
        ordered=question.question_type == QuestionType.PUZZLE.value,
        free_text=question.question_type == QuestionType.TYPE_ANSWER.value,
    )


def grade_answer(
    result_id: int,
    question: Question,
    positions: list[int],
    text_answer: str | None = None,
) -> tuple[bool, str, str]:
    """(to'g'rimi, talaba javobi matni, to'g'ri javob matni).

    `positions` — talaba ekranda tanlagan o'rinlar. Matn emas, o'rin
    ishlatiladi: bir xil variantlar, turli apostroflar va HTML solishtirishni
    buzardi.
    """
    options = question_options(question)

    if question.question_type == QuestionType.TYPE_ANSWER.value:
        expected = (question.payload or {}).get("answers") or []
        given = text_answer or ""
        normalized = normalize_text_answer(given)
        is_correct = any(normalize_text_answer(item) == normalized for item in expected) and bool(normalized)
        # Kutilgan javob sifatida birinchisi ko'rsatiladi: hisobotda qaysi
        # javob to'g'ri bo'lgani ko'rinib tursin.
        return is_correct, given.strip(), expected[0] if expected else ""

    if question.question_type == QuestionType.PUZZLE.value:
        # `positions` — talaba tuzgan tartib: ko'rsatilgan ro'yxatdagi
        # o'rinlar ketma-ketligi. Ular asl indekslarga o'giriladi va
        # to'g'ri tartib (0, 1, 2, ...) bilan solishtiriladi.
        order = order_for(result_id, question.id, len(options))
        chosen = [order[position] for position in positions]
        is_correct = chosen == list(range(len(options)))
        chosen_text = " → ".join(options[index] for index in chosen)
        correct_text = " → ".join(options)
        return is_correct, chosen_text, correct_text

    if question.question_type == QuestionType.TRUE_FALSE.value:
        correct_bool = bool((question.payload or {}).get("correct"))
        # 0 — «To'g'ri», 1 — «Noto'g'ri».
        chosen_bool = positions[0] == 0
        correct_text = TRUE_FALSE_OPTIONS[0 if correct_bool else 1]
        return chosen_bool == correct_bool, TRUE_FALSE_OPTIONS[positions[0]], correct_text

    order = order_for(result_id, question.id, len(options))

    if question.question_type == QuestionType.MULTI_SELECT.value:
        correct_indexes = set((question.payload or {}).get("correct") or [])
        chosen_indexes = {order[position] for position in positions}
        chosen_text = "; ".join(options[index] for index in sorted(chosen_indexes))
        correct_text = "; ".join(options[index] for index in sorted(correct_indexes))
        # Ball faqat to'liq mos kelganda: qisman ball butun baholash
        # tizimini o'zgartirishni talab qiladi.
        return chosen_indexes == correct_indexes, chosen_text, correct_text

    # Klassik savol: harflar tartibi eski mantiq bilan bir xil.
    letters = option_order(result_id, question.id)
    chosen_letter = letters[positions[0]]
    is_correct = chosen_letter == question.correct_option
    return (
        is_correct,
        getattr(question, f"option_{chosen_letter}"),
        getattr(question, f"option_{question.correct_option}"),
    )
