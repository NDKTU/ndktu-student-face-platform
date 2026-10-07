"""Savollar Excel faylining formati — bitta joyda.

Nega alohida modul. Ilgari format ikki joyda mustaqil ta'riflangan edi:
eksport `download_questions_excel` da sarlavhalarni o'zi yozardi, import esa
ustunlarni o'rni bo'yicha o'qirdi. Ikkalasi bir-birini bilmasdi, natijada
eksport qilingan faylni qaytadan yuklasa, savol matni o'rniga qator raqami
tushardi va barcha to'g'ri javoblar «a» ga aylanardi. Endi parser ham,
eksport ham, shablon ham shu modulga qaraydi.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

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


#: Sarlavha qatori shu qatorlar ichidan qidiriladi: undan yuqorida fayl
#: nomi, fan nomi yoki bo'sh qatorlar turishi odatiy hol.
HEADER_SEARCH_ROWS = 10

#: Sarlavhaga xos so'zlar. Tanilmagan sarlavhani («Savollar», «1-variant»)
#: savoldan ajratish uchun: bitta savol qatorida bunday so'z ikki katakda
#: kamdan-kam uchraydi, sarlavhada esa deyarli har katakda.
_HEADER_WORDS = ("savol", "variant", "javob", "question", "option", "answer", "вопрос", "вариант", "ответ")


@dataclass
class QuestionSheet:
    """O'qilgan varaq: ma'lumot qatorlari va ularning Excel'dagi raqami."""

    #: (Excel qator raqami, kataklar) — sarlavhadan keyingi qatorlar.
    rows: list[tuple[int, list[object]]]
    #: Sarlavha bo'yicha ustunlar; `None` — ustunlar o'rni bo'yicha o'qiladi.
    mapping: dict[str, int] | None
    #: Sarlavha qatori (normallashtirilgan) — eski fayllardagi
    #: `subject_id`/`correct_option` kabi ustunlarni topish uchun.
    header: list[str] = field(default_factory=list)
    #: Foydalanuvchiga ko'rsatiladigan izohlar (qaysi qator sarlavha bo'ldi).
    notes: list[str] = field(default_factory=list)
    width: int = 0

    def column(self, name: str) -> int | None:
        """Sarlavhadagi ustun o'rni (masalan, eski fayldagi `subject_id`)."""
        target = normalize_header(name)
        return self.header.index(target) if target in self.header else None


def _is_blank(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and value != value:  # NaN
        return True
    return not str(value).strip()


#: Bittasining o'zi qatorni sarlavha qiladigan nomlar: texnik ustunlar
#: (eski eksport va qo'lda yasalgan fayllar) va tanish sarlavhalar.
#: Bir harfli «a»/«b» bu yerga kirmaydi — ular savol variantlari ham bo'ladi.
_TECHNICAL_HEADERS = frozenset(
    {"subject_id", "correct_option", "№", "#", "n"}
    | {alias for alias in _BY_ALIAS if len(alias) > 2}
)

#: «Ustun 1», «Column2», «Столбец 3» — umumiy ustun nomlari.
_GENERIC_COLUMN = re.compile(r"^(ustun|column|col|колонка|столбец)\s*\d+$")


def _looks_like_header(cells: list[object]) -> bool:
    """Tanilmagan, lekin sarlavhaga o'xshash qator.

    Belgilar: texnik/tanish ustun nomi (bittasi yetadi) yoki kamida ikki
    katakda sarlavha so'zi / «Ustun 1» kabi umumiy nom. Savol qatorida
    bular deyarli uchramaydi.
    """
    hits = 0
    for value in cells:
        text = normalize_header(value)
        if not text:
            continue
        if text in _TECHNICAL_HEADERS:
            return True
        if _GENERIC_COLUMN.match(text) or any(word in text for word in _HEADER_WORDS):
            hits += 1
    return hits >= 2


def read_question_sheet(contents: bytes) -> QuestionSheet:
    """Savollar faylining birinchi varag'ini o'qiydi va sarlavhani o'zi topadi.

    Ilgari `pd.read_excel` standart holatda ishlatilardi — u BIRINCHI qatorni
    har doim sarlavha deb oladi. Natijada sarlavhasiz faylda birinchi savol
    jimgina yo'qolardi, sarlavha ustida nom yoki bo'sh qator bo'lsa esa
    sarlavhaning o'zi «Savol / A variant ...» degan savol bo'lib bankka
    tushardi. Endi:

    1. sarlavha birinchi `HEADER_SEARCH_ROWS` qator ichidan qidiriladi;
       undan yuqoridagi qatorlar tashlab yuboriladi;
    2. topilmasa — hamma qator savol (ustunlar o'rni bo'yicha); faqat
       birinchi to'la qator sarlavhaga o'xshasa, u tashlanadi va bu
       haqda izoh qaytadi.

    Qator raqamlari — Excel'dagi haqiqiy raqamlar (1 dan).
    """
    import pandas as pd

    frame = pd.read_excel(io.BytesIO(contents), header=None, dtype=object)
    raw = [[None if _is_blank(v) else v for v in row] for row in frame.itertuples(index=False, name=None)]
    width = max((len(row) for row in raw), default=0)

    header_at: int | None = None
    mapping: dict[str, int] | None = None
    for index, cells in enumerate(raw[:HEADER_SEARCH_ROWS]):
        found = resolve_columns(cells)
        if found is not None:
            header_at, mapping = index, found
            break

    notes: list[str] = []
    if header_at is None:
        first = next((i for i, cells in enumerate(raw) if any(v is not None for v in cells)), None)
        if first is not None and _looks_like_header(raw[first]):
            header_at = first
            notes.append(f"{first + 1}-qator sarlavha deb hisoblandi va savol sifatida yuklanmadi")

    start = header_at + 1 if header_at is not None else 0
    header = [normalize_header(v) for v in raw[header_at]] if header_at is not None else []
    rows = [(index + 1, cells) for index, cells in enumerate(raw) if index >= start]
    return QuestionSheet(rows=rows, mapping=mapping, header=header, notes=notes, width=width)
