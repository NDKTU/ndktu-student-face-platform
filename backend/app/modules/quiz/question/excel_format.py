"""Savollar Excel faylining formati — bitta joyda.

Nega alohida modul. Ilgari format ikki joyda mustaqil ta'riflangan edi:
eksport `download_questions_excel` da sarlavhalarni o'zi yozardi, import esa
ustunlarni o'rni bo'yicha o'qirdi. Ikkalasi bir-birini bilmasdi, natijada
eksport qilingan faylni qaytadan yuklasa, savol matni o'rniga qator raqami
tushardi va barcha to'g'ri javoblar «a» ga aylanardi. Endi parser ham,
eksport ham, shablon ham shu modulga qaraydi.
"""

from __future__ import annotations

import re

#: Maydonlar tartibi — shablon ustunlari aynan shunday joylashadi.
#:
#: «To'g'ri javob» ustuni YO'Q: to'g'ri javob — har doim A varianti.
#: Sabab oddiy — o'qituvchilar bu ustunda juda ko'p xato qilardi: «А»
#: ni kirillcha yozish (lotincha bilan bir xil ko'rinadi), «B)», «2»,
#: «variant b» — bularning hammasi tanilmay, jimgina «a» ga aylanardi.
#: Yaʼni ustun xatoni OLDINI OLMAY, uni yashirardi.
#:
#: Talaba uchun bu hech narsani o'zgartirmaydi: variantlar har bir
#: urinishda aralashtirib ko'rsatiladi (`quiz_process/option_order.py`),
#: shuning uchun «to'g'ri javob doim birinchi» degan qoida ekranda
#: ko'rinmaydi.
FIELDS = ("text", "option_a", "option_b", "option_c", "option_d")

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

#: Sarlavhadagi qavs ichidagi izoh — «A variant (to'g'ri javob)».
_BRACKETS = re.compile(r"\([^)]*\)")


def normalize_header(value: object) -> str:
    """Sarlavhani taqqoslashga yaroqli ko'rinishga soladi."""
    text = str(value if value is not None else "").strip().lower()
    for char in _APOSTROPHES:
        text = text.replace(char, "'")
    # Qavs ichidagi izoh tashlab yuboriladi: shablon va eksport
    # sarlavhasi «A variant (to'g'ri javob)» ko'rinishida yoziladi —
    # qoida o'qituvchining ko'z oldida tursin. Qavs qolsa, sarlavha
    # taniklmay, fayl ustun O'RNI bo'yicha o'qilardi; eksportda esa
    # birinchi ustun «№», ya'ni hamma ma'lumot bir ustunga siljirdi.
    text = _BRACKETS.sub(" ", text)
    # Ichki ortiqcha bo'shliqlar: «A  variant» ham «A variant» bo'lsin.
    return " ".join(text.split())


#: Tez qidirish uchun teskari jadval.
_BY_ALIAS: dict[str, str] = {
    normalize_header(alias): field for field, aliases in ALIASES.items() for alias in aliases
}

#: Sarlavhalar tanildi deb hisoblash uchun kamida shular topilishi kerak.
REQUIRED_FIELDS = ("text", "option_a", "option_b", "option_c", "option_d")

#: To'g'ri javob harflari — eski fayllarni o'qish uchun.
LETTERS = ("a", "b", "c", "d")

#: Kirillcha ko'rinishlar: «А», «В», «С» lotinchadan farq qilmaydi, lekin
#: boshqa belgi. O'qituvchi buni ko'rmaydi, Excel esa o'zgartirmaydi.
_CYRILLIC_LETTERS = {"а": "a", "в": "b", "б": "b", "с": "c", "ц": "c", "д": "d"}


def parse_correct_option(raw: object) -> str | None:
    """Eski fayldagi «To'g'ri javob» qiymatini harfga o'giradi.

    `None` — qiymat yo'q yoki tanib bo'lmadi; chaqiruvchi «a» ni qo'yadi.

    Yangi shablonda bunday ustun yo'q, lekin ilgari yuklab olingan
    fayllar (eksport ham, shablon ham) unda haqiqiy «b»/«c»/«d» ni
    saqlaydi. Agar ular e'tiborsiz qoldirilsa, o'qituvchi o'z bankini
    qayta yuklagan zahoti BARCHA javoblari «a» bo'lib qolardi.
    """
    if raw is None:
        return None
    text = str(raw).strip().lower()
    if not text:
        return None

    def letter_of(token: str) -> str | None:
        token = token.strip(".)(-:,; ")
        if token in LETTERS:
            return token
        if token in _CYRILLIC_LETTERS:
            return _CYRILLIC_LETTERS[token]
        if token in ("1", "2", "3", "4"):
            return LETTERS[int(token) - 1]
        return None

    # «B», «b)», «2», «B variant», «variant b» — hammasi uchraydi.
    # Shuning uchun bitta belgidan iborat bo'laklar qidiriladi, matnning
    # BIRINCHI HARFI emas: aks holda «bilmadim» ham «b» bo'lib ketardi.
    found = {letter for token in text.split() if (letter := letter_of(token)) is not None}
    if len(found) == 1:
        return found.pop()
    return None


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
