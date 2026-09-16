"""Foydalanuvchi kiritgan havolani tekshirish va sxemasini to'ldirish.

Havola sahifada ``<a href=...>`` bo'lib chiqadi. ``javascript:`` yoki
``data:text/html`` sxemasi bosilganda kod ishga tushadi — ya'ni oddiy matn
maydoni XSS ga aylanadi.

Faqat React ga tayanib bo'lmaydi: u ``javascript:`` ni render paytida to'sadi,
lekin bu ma'lumotni emas, bitta kutubxonaning bitta versiyasidagi
xatti-harakatni himoya qilish demak. Yozuvning o'zi bazada qoladi va API
orqali tarqaladi: PDF/Word eksporti, pochta xabari, mobil ilova yoki
``window.open(url)`` — bularning hech biri React emas. Shuning uchun qoida
ma'lumot kirish nuqtasida turadi.

Qoida «yomonni taqiqlash» emas, «faqat yaxshisiga ruxsat berish» tamoyilida:
``http`` va ``https`` dan boshqa hamma narsa rad etiladi. ``javascript:`` ni
yashirishga urinishlar (``JaVaScRiPt:``, ``java\\tscript:``, oldidagi bo'sh
joy) alohida tozalashni talab qilmaydi — ``urlsplit`` ularni o'zi
normallashtiradi va sxema baribir ro'yxatdan o'tmaydi.

Bu yagona manba: e'lon havolasi ham, dars materiali havolasi ham shu yerga
keladi. Bir qoidaning ikkita nusxasi vaqt o'tib bir-biridan uzoqlashadi —
variantlar tartibi bilan aynan shunday bo'lgan edi.
"""

from typing import Optional
from urllib.parse import urlsplit

#: Ruxsat etilgan sxemalar. Ro'yxat ataylab qisqa.
ALLOWED_SCHEMES = ("http", "https")


class UnsafeUrlError(ValueError):
    """Havola sxemasi yoki manzili qabul qilinmaydi."""


def normalize_url(value: str) -> str:
    """Tozalangan havolani qaytaradi yoki ``UnsafeUrlError`` ko'taradi.

    Sxemasiz kiritilgan manzil (``epmos.nsumt.uz/...``) rad etilmaydi, balki
    ``https://`` bilan to'ldiriladi: odamlar havolani shunday ko'chirib
    qo'yishadi va buni xato deb qaytarish bekorga to'siq bo'lardi. Ammo sxema
    **yozilgan** bo'lsa, u ro'yxatdan bo'lishi shart.
    """
    raw = (value or "").strip()
    if not raw:
        raise UnsafeUrlError("Havola bo'sh")

    parts = urlsplit(raw)
    if not parts.scheme:
        # `//nsumt.uz/x` — sxemasiz nusxa ko'chirishning odatiy shakli:
        # ikkinchi marta qo'shsak, `https:////nsumt.uz` bo'lib ketardi.
        raw = f"https:{raw}" if raw.startswith("//") else f"https://{raw}"
        parts = urlsplit(raw)

    if parts.scheme not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("Havola http:// yoki https:// bilan boshlanishi kerak")
    # `urlsplit` hostni tekshirmaydi: `https://` ham bo'sh host bilan o'tib
    # ketardi. Nuqta talab qilinadi — domensiz manzil havola emas.
    if not parts.hostname or "." not in parts.hostname:
        raise UnsafeUrlError("Havolada to'g'ri domen ko'rsatilmagan")

    return raw


def normalize_optional_url(value: Optional[str]) -> Optional[str]:
    """Bo'sh qiymatni ``None`` ga aylantiradi, qolganini :func:`normalize_url` ga beradi.

    Havola majburiy bo'lmagan maydonlar uchun (masalan, e'lon havolasi).
    """
    if value is None:
        return None
    if not value.strip():
        return None
    return normalize_url(value)
