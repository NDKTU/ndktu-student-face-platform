"""Savollar Excel faylining formati — bitta joyda.

Nega alohida modul. Ilgari format ikki joyda mustaqil ta'riflangan edi:
eksport `download_questions_excel` da sarlavhalarni o'zi yozardi, import esa
ustunlarni o'rni bo'yicha o'qirdi. Ikkalasi bir-birini bilmasdi, natijada
eksport qilingan faylni qaytadan yuklasa, savol matni o'rniga qator raqami
tushardi va barcha to'g'ri javoblar «a» ga aylanardi. Endi parser ham,
eksport ham, shablon ham shu modulga qaraydi.
"""

from __future__ import annotations

#: Maydonlar tartibi — shablon ustunlari aynan shunday joylashadi.
FIELDS = ("text", "option_a", "option_b", "option_c", "option_d", "correct_option")

#: Shablon va eksport yozadigan sarlavhalar.
HEADERS = {
    "text": "Savol",
    "option_a": "A variant",
    "option_b": "B variant",
    "option_c": "C variant",
    "option_d": "D variant",
    "correct_option": "To'g'ri javob",
}

TEMPLATE_HEADERS = [HEADERS[field] for field in FIELDS]

#: Tanish sarlavhalar. Normalizatsiyadan keyingi ko'rinishda yoziladi
#: (kichik harf, apostrof bitta xil). O'qituvchilar faylni qo'lda ham
#: yasaydi, shuning uchun ruscha va inglizcha nomlar ham qabul qilinadi.
ALIASES: dict[str, tuple[str, ...]] = {
    "text": ("savol", "savol matni", "question", "matn", "вопрос"),
    "option_a": ("a variant", "a varianti", "variant a", "option_a", "a", "вариант a"),
    "option_b": ("b variant", "b varianti", "variant b", "option_b", "b", "вариант b"),
    "option_c": ("c variant", "c varianti", "variant c", "option_c", "c", "вариант c"),
    "option_d": ("d variant", "d varianti", "variant d", "option_d", "d", "вариант d"),
    "correct_option": (
        "to'g'ri javob",
        "togri javob",
        "correct_option",
        "correct",
        "javob",
        "правильный ответ",
    ),
}

#: Apostrofning uch ko'rinishi: to'g'ri (U+2019), teskari (U+2018), oddiy
#: (U+0027) va o'zbekcha «okina» (U+02BC). Excel avtomatik almashtiradi,
#: foydalanuvchi esa qaysi biri turganini ko'rmaydi.
_APOSTROPHES = "’‘ʼʻ´`"


def normalize_header(value: object) -> str:
    """Sarlavhani taqqoslashga yaroqli ko'rinishga soladi."""
    text = str(value if value is not None else "").strip().lower()
    for char in _APOSTROPHES:
        text = text.replace(char, "'")
    # Ichki ortiqcha bo'shliqlar: «A  variant» ham «A variant» bo'lsin.
    return " ".join(text.split())


#: Tez qidirish uchun teskari jadval.
_BY_ALIAS: dict[str, str] = {
    normalize_header(alias): field for field, aliases in ALIASES.items() for alias in aliases
}

#: Sarlavhalar tanildi deb hisoblash uchun kamida shular topilishi kerak.
#: `correct_option` majburiy emas — usiz ham fayl yuklanadi, parser
#: ogohlantirish beradi va «a» ni qo'yadi (eski xatti-harakat).
REQUIRED_FIELDS = ("text", "option_a", "option_b", "option_c", "option_d")


def resolve_columns(columns) -> dict[str, int] | None:
    """Sarlavhalar bo'yicha ustun indekslarini topadi.

    `None` — sarlavhalarni tanib bo'lmadi; chaqiruvchi eski, o'rni bo'yicha
    o'qish yo'liga tushadi. Shu tufayli ilgari yuklangan fayllar formati
    ishlashda davom etadi.
    """
    found: dict[str, int] = {}
    for index, column in enumerate(columns):
        field = _BY_ALIAS.get(normalize_header(column))
        # Takrorlangan sarlavhada birinchisi yutadi: eksportda «A variant»
        # bitta, lekin qo'lda yasalgan faylda nusxa bo'lishi mumkin.
        if field is not None and field not in found:
            found[field] = index
    if any(field not in found for field in REQUIRED_FIELDS):
        return None
    return found
