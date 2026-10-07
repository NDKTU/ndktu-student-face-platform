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


class ControlType(str, enum.Enum):
    """Kurs savollari qaysi nazorat uchun yozilgan.

    Oʻqituvchi savollarni oldindan nazorat turlari boʻyicha toʻplaydi:
    ON — oraliq, JN — joriy, YN — yakuniy nazorat. Roʻyxatdan tashqari
    nazoratlar ``OTHER`` ga tushadi.
    """

    ON1 = "ON1"
    ON2 = "ON2"
    JN1 = "JN1"
    JN2 = "JN2"
    YN = "YN"
    OTHER = "OTHER"


#: Kurs nazorati (`MIDTERM`) nomi — turidan yasaladi, oʻqituvchi yozmaydi:
#: aks holda bir xil nazorat «1-oraliq», «1 oraliq nazorat», «ON1» boʻlib
#: ketardi va natijalarni nomi boʻyicha solishtirib boʻlmasdi.
CONTROL_TYPE_TITLES = {
    ControlType.ON1: "1-oraliq nazorat",
    ControlType.ON2: "2-oraliq nazorat",
    ControlType.JN1: "1-joriy nazorat",
    ControlType.JN2: "2-joriy nazorat",
    ControlType.YN: "Yakuniy nazorat",
    ControlType.OTHER: "Boshqa nazorat",
}


class QuizType(str, enum.Enum):
    LESSON_QUIZ = "LESSON_QUIZ"
    #: Kurs nazorati (UI da «Nazorat») — kurs testi. Savollari tanlangan
    #: darslardan va kursning «Test savollari» dagi oʻsha turdagi
    #: (``Quiz.control_type``) savollardan yigʻiladi.
    MIDTERM = "MIDTERM"
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


# Mashg'ulot turlari. Kurs turi ham, dars turi ham shu ro'yxatdan oladi.
# EPOS yuklamasi aynan shu kesimda keladi — `lecture`, `practice`, `lab`;
# `seminar` EPOS'da yo'q va faqat qo'lda yaratiladi. Enum emas, satr:
# yangi tur qo'shish migratsiyasiz bo'lishi kerak.
COURSE_TYPE_LABELS = {
    "lecture": "ma'ruza",
    "practice": "amaliyot",
    "lab": "tajriba",
    "seminar": "seminar",
}


def course_type_label(course_type: str | None) -> str | None:
    """«lecture» -> «ma'ruza». Noma'lum qiymat o'zicha qaytadi."""
    if not course_type:
        return None
    return COURSE_TYPE_LABELS.get(course_type, course_type)
