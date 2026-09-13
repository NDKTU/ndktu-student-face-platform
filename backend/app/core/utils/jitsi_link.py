"""Jitsi havolasidan xona nomini ajratish.

Zoom bilan yonma-yon turadigan muqobil: sinov uchun qo'shildi, Zoom o'z
joyida qoladi. Zoom'dan farqi — bu yerda imzo (signature) yo'q: ochiq
Jitsi serverida (meet.jit.si) xonaga qo'shilish uchun kalit kerak emas,
shuning uchun bekend faqat havolani tekshiradi.

Havola turlicha bo'ladi:

    https://meet.jit.si/NdktuDars12
    https://meet.jit.si/NdktuDars12#config.startWithVideoMuted=true
    meet.jit.si/NdktuDars12
    NdktuDars12                                 <- shunchaki xona nomi
"""

import re
from urllib.parse import urlparse

# Xona nomi: harf, raqam, defis va pastki chiziq. Bo'sh joy va slash
# bo'lmasligi kerak — Jitsi ularni URL'da boshqacha talqin qiladi.
_ROOM_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{2,59}$")


class JitsiLinkError(ValueError):
    """Havola Jitsi xonasiga o'xshamaydi."""


def parse_jitsi_link(raw: str) -> tuple[str, str]:
    """(xona_nomi, domen) qaytaradi.

    Domen ham qaytariladi: muassasa o'z Jitsi serverini ko'tarsa, havola
    meet.jit.si'ga bog'lanib qolmasligi kerak.
    """
    value = (raw or "").strip()
    if not value:
        raise JitsiLinkError("Jitsi havolasi bo'sh")

    # Faqat xona nomi yozilgan bo'lsa — havola talab qilmaymiz, standart
    # ochiq server ishlatiladi.
    if "/" not in value and "." not in value:
        if _ROOM_RE.match(value):
            return value, "meet.jit.si"
        raise JitsiLinkError(
            "Xona nomi faqat harf, raqam, defis va pastki chiziqdan iborat "
            "bo'lishi kerak (3-60 belgi)"
        )

    parsed = urlparse(value if "//" in value else f"https://{value}")
    if not parsed.hostname:
        raise JitsiLinkError("Havola noto'g'ri — domen topilmadi")

    # Yo'lning birinchi bo'lagi — xona nomi. Qolgani (`#config...`) e'tiborsiz:
    # uni frontend o'zi qo'yadi.
    room = parsed.path.strip("/").split("/")[0]
    if not room:
        raise JitsiLinkError(
            "Havolada xona nomi yo'q. Masalan: https://meet.jit.si/NdktuDars12"
        )
    if not _ROOM_RE.match(room):
        raise JitsiLinkError(
            "Xona nomi faqat harf, raqam, defis va pastki chiziqdan iborat "
            "bo'lishi kerak (3-60 belgi)"
        )

    return room, parsed.hostname
