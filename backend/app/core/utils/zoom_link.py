"""Zoom havolasidan uchrashuv raqami va parolini ajratish.

O'qituvchi Zoom ilovasidan nusxa olgan havolani qo'yadi, bizga esa Meeting
SDK uchun raqam kerak. Havola turlicha bo'ladi:

    https://us05web.zoom.us/j/89012345678?pwd=abc.1
    https://zoom.us/w/85512345678?tk=...&pwd=xyz
    https://nsumt.zoom.us/my/teacher            <- shaxsiy xona (raqamsiz)
    89012345678                                 <- shunchaki raqam
"""

import re
from urllib.parse import parse_qs, urlparse

# Uchrashuv raqami — 9..11 xona. Zoom hujjatlarida shu oraliq.
_MEETING_NUMBER_RE = re.compile(r"^\d{9,11}$")
_PATH_NUMBER_RE = re.compile(r"/(?:j|w|s|wc(?:/join)?)/(\d{9,11})")


class ZoomLinkError(ValueError):
    """Havola Zoom uchrashuviga o'xshamaydi."""


def parse_zoom_link(raw: str) -> tuple[str, str | None]:
    """(uchrashuv_raqami, parol) qaytaradi.

    Parol havolada bo'lmasligi mumkin — bu xato emas: uchrashuv parolsiz
    ham bo'ladi, talaba esa uni o'zi kiritadi.
    """
    value = (raw or "").strip()
    if not value:
        raise ZoomLinkError("Zoom havolasi bo'sh")

    # Faqat raqam yozilgan bo'lsa — havola talab qilmaymiz.
    digits = value.replace(" ", "").replace("-", "")
    if _MEETING_NUMBER_RE.match(digits):
        return digits, None

    parsed = urlparse(value if "//" in value else f"https://{value}")
    if not parsed.hostname or "zoom.us" not in parsed.hostname.lower():
        raise ZoomLinkError("Havola Zoom uchrashuviga o'xshamaydi (zoom.us bo'lishi kerak)")

    match = _PATH_NUMBER_RE.search(parsed.path)
    if not match:
        raise ZoomLinkError(
            "Havolada uchrashuv raqami topilmadi. Zoom'da «Copy Invite Link» orqali "
            "olingan havolani qo'ying (masalan .../j/89012345678?pwd=...)"
        )

    passcode = parse_qs(parsed.query).get("pwd", [None])[0]
    return match.group(1), passcode
