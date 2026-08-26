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
