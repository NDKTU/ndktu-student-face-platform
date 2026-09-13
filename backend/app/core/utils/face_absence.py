"""Yuz tekshiruvi yozuvlaridan «yo'q bo'lgan davr»larni yig'ish.

Nega alohida modul. Bu sof funksiya: kirishi — yozuvlar ro'yxati, chiqishi —
davrlar. Bazaga ham, HTTP'ga ham bog'liq emas, shuning uchun uni repozitoriy
ichida yashirmasdan shu yerda saqlaymiz va to'g'ridan-to'g'ri sinash mumkin.

Nega davrlar bazada saqlanmaydi. Chegara (`FAILED_STREAK`) vaqt o'tib
o'zgarishi mumkin — masalan 2 o'rniga 3 kadr. Xom yozuvlar joyida turgani
uchun eski darslarni ham yangi qoida bo'yicha qayta hisoblash mumkin; tayyor
davrlar yozilganda esa noto'g'ri chegara bilan yozilganini orqaga qaytarib
bo'lmasdi.

Nega debounce kerak. Tekshiruv endi daqiqada bir marta ketadi va bitta
muvaffaqiyatsiz kadr hali «talaba yo'q» degani emas: qalam olish uchun
engashish, qo'l bilan yuzni qo'llab turish, yonidan uy a'zosi o'tishi —
hammasi bitta kadrni buzadi. Ketma-ket ikkitasi buzilsa, bu allaqachon
tasodif emas.
"""

from dataclasses import dataclass
from datetime import datetime

#: Davr ochilishi uchun ketma-ket nechta muvaffaqiyatsiz kadr kerak.
FAILED_STREAK = 2

#: Talabani ayblaydigan statuslar — faqat shular davr hosil qiladi.
FAILED_STATUSES = frozenset({"no_face", "multiple_faces", "different_person"})

#: Talabaning aybi emas: kamera ochilmadi, profil surati yo'q, yoki sahifa
#: fonda qolgan (boshqa tabda konspekt ochgan). Bular davr ochmaydi va uni
#: yopmaydi ham — shunchaki «ma'lumot yo'q» deb o'tkazib yuboriladi.
NEUTRAL_STATUSES = frozenset({"no_camera", "no_reference", "page_hidden"})


@dataclass
class AbsenceSpan:
    """Yuz ko'rinmagan bir davr.

    `end` — `None` bo'lsa, talaba oxirigacha qaytmagan: yozuvlar tugaguncha
    yuz topilmadi. Bu «chiqib ketdi» degani emas, buni ajratish hisobotning
    o'zida bo'ladi.
    """

    start: datetime
    end: datetime | None
    checks: int
    statuses: list[str]
    #: Shu davrdagi saqlangan suratlarning tekshiruv id'lari.
    image_check_ids: list[int]


def build_absence_spans(records: list) -> list[AbsenceSpan]:
    """Vaqt bo'yicha tartiblangan yozuvlardan davrlarni yig'adi.

    Yozuv sifatida `status` va `created_at` atributlari bo'lgan har qanday
    obyekt yuradi (ORM qatori ham, test uchun oddiy obyekt ham).
    """
    spans: list[AbsenceSpan] = []
    streak: list = []

    def flush(end: datetime | None) -> None:
        """Yig'ilgan ketma-ketlikni davrga aylantiradi (yetarli bo'lsa)."""
        if len(streak) >= FAILED_STREAK:
            spans.append(
                AbsenceSpan(
                    # Boshlanish — birinchi buzuq kadrniki, ikkinchisiniki emas:
                    # talaba aslida o'shanda yo'qolgan, biz faqat keyinroq ishondik.
                    start=streak[0].created_at,
                    end=end,
                    checks=len(streak),
                    statuses=[item.status for item in streak],
                    image_check_ids=[
                        item.id for item in streak if getattr(item, "image_name", None)
                    ],
                )
            )
        streak.clear()

    for record in sorted(records, key=lambda item: item.created_at):
        if record.status in FAILED_STATUSES:
            streak.append(record)
        elif record.status in NEUTRAL_STATUSES:
            # Ma'lumot yo'q — ketma-ketlikni na uzadi, na davom ettiradi.
            continue
        else:
            # Yuz topildi: davr shu kadrda yopiladi.
            flush(record.created_at)

    # Yozuvlar tugadi, lekin yuz qaytmadi — davr ochiq qoladi.
    flush(None)
    return spans


def spans_total_seconds(spans: list[AbsenceSpan], fallback_end: datetime | None) -> int:
    """Davrlarning umumiy davomiyligi, sekundda.

    Ochiq davr uchun `fallback_end` ishlatiladi — odatda talabaning oxirgi
    tekshiruvi. Uni dars oxiriga cho'zish noto'g'ri bo'lardi: tekshiruvlar
    to'xtagan payt bizga ma'lum, undan keyingisi esa taxmin.
    """
    total = 0.0
    for span in spans:
        end = span.end or fallback_end
        if end is None:
            continue
        total += max(0.0, (end - span.start).total_seconds())
    return int(total)
