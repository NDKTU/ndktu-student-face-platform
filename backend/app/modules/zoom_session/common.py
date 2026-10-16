"""Zoom seanslari: umumiy sozlamalar va kichik yordamchilar (`repository.py` dan ajratilgan)."""

from datetime import datetime, timedelta, timezone


from app.core.utils.face_absence import FAILED_STATUSES



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


_STATUS_MESSAGE = {
    "ok": "Shaxsingiz tasdiqlandi",
    "no_face": "Kadrda yuz ko'rinmadi — kameraga qarab turing",
    "multiple_faces": "Kadrda bir nechta odam ko'rindi — yolg'iz qoling",
    "different_person": "Yuz HEMIS'dagi surat bilan mos kelmadi — yorug' joyda qayta urinib ko'ring",
    "no_reference": "HEMIS suratingizdan yuz aniqlanmadi — dekanatga murojaat qiling",
    "spoof": "Kamera oldida tirik yuz bo'lishi kerak — rasm yoki telefon ekrani qabul qilinmaydi",
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
