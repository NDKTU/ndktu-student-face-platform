"""Zoom seanslari: umumiy sozlamalar va kichik yordamchilar (`repository.py` dan ajratilgan)."""

from datetime import datetime, timedelta, timezone


from app.core.utils.face_absence import FAILED_STATUSES
from app.core.utils.face_service import FACE_ENTRY_MESSAGES



#: Toshkent — UTC+5, yozgi vaqt yo'q. Kalendar sanalarini naiv UTC ga o'tkazish uchun.
TASHKENT_OFFSET = timedelta(hours=5)


#: Kalendar so'rovi eng ko'pi shuncha kunni oladi: oy setkasi 6 hafta = 42 kun.
MAX_CALENDAR_DAYS = 62


#: Talaba seansga boshlanishdan shuncha oldin kira oladi.
EARLY_JOIN = timedelta(minutes=10)


#: `join` tekshiruvi `ok` bo'lgach imzo olish uchun vaqt. Qisqa: tasdiqlangan
#: talaba o'rniga boshqasi o'tirib olmasin; SDK qayta ulanishiga esa yetadi.
FACE_OK_TTL_SECONDS = 180


#: Bitta «yo'q» davridan nechta surat saqlanadi (dalil uchun boshidagilari).
MAX_IMAGES_PER_SPAN = 2


#: Talabaning oxirgi tekshiruvi hozirdan (dars tugagach — guruhnikidan)
#: shuncha orqada — erta chiqib ketgan.
LEFT_EARLY_GAP_SECONDS = 5 * 60


#: Webhook hodisasi seansga vaqt bo'yicha bog'lanadi: bir xonada (shaxsiy
#: xona) bir necha seans bo'lishi mumkin. Dars cho'zilsa, chiqish hodisasi
#: tugash vaqtidan keyin keladi — shuning uchun oxirida zaxira kattaroq.
EVENT_MATCH_BEFORE = timedelta(minutes=30)


EVENT_MATCH_AFTER = timedelta(hours=3)


#: SDK `customerKey` — webhook'da ishtirokchini foydalanuvchiga bog'laydi.
CUSTOMER_KEY_PREFIX = "lms-"


_PARTICIPANT_EVENTS = {"meeting.participant_joined": "joined", "meeting.participant_left": "left"}


#: Testdagi bilan bir xil matnlar (`FACE_ENTRY_MESSAGES`) + dars davomidagi
#: tekshiruvning o'z holatlari.
_STATUS_MESSAGE = {
    **FACE_ENTRY_MESSAGES,
    "no_camera": "Kamera ochilmadi",
    "page_hidden": "Sahifa fonda edi — tekshiruv o'tkazilmadi",
}


_FAILED = set(FAILED_STATUSES)


def _face_ok_key(session_id: int, user_id: int) -> str:
    return f"zoom:face-ok:{session_id}:{user_id}"


def _parse_zoom_time(value) -> datetime | None:
    """`2026-10-10T09:00:00Z` → naiv UTC."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed
