"""Domen bo'ylab umumiy sanoqli qiymatlar.

Ular `str` dan meros oladi, shuning uchun Pydantic ham, SQLAlchemy ham ularni
oddiy satr sifatida qabul qiladi — ustunlar `String` bo'lib qoladi, Postgres
enum tipi yaratilmaydi (yangi a'zo qo'shish migratsiya talab qilmasin uchun).
"""

import enum


class EducationType(str, enum.Enum):
    BACHELOR = "Bakalavr"
    MASTER = "Magistr"
    DOCTORATE = "Doktorantura"


class QuestionType(str, enum.Enum):
    QUIZ = "QUIZ"
    TRUE_FALSE = "TRUE_FALSE"
    MULTI_SELECT = "MULTI_SELECT"
    TYPE_ANSWER = "TYPE_ANSWER"
    PUZZLE = "PUZZLE"


class QuizType(str, enum.Enum):
    LESSON_QUIZ = "LESSON_QUIZ"
    SEMESTER_FINAL = "SEMESTER_FINAL"
    YEAR_PROMOTION = "YEAR_PROMOTION"
    PUBLIC_FREE = "PUBLIC_FREE"


# Semestrlar nomi: universitetda ular «1/2» emas, «kuzgi» va «bahorgi» deb
# ataladi. Nom test va kurs sarlavhasiga kiradi, shuning uchun bitta joyda
# turadi — quiz va course repozitoriylari shu yerdan oladi.
SEMESTER_LABELS = {1: "kuzgi", 2: "bahorgi"}


def semester_label(semester_number: int | None) -> str | None:
    """1 -> «kuzgi semestr», 2 -> «bahorgi semestr». Boshqa qiymat — o'zicha."""
    if not semester_number:
        return None
    name = SEMESTER_LABELS.get(semester_number)
    return f"{name} semestr" if name else f"{semester_number}-semestr"
