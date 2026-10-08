"""Qat'iy rejim: talaba sahifadan chiqsa, urinish yopiladi.

Brauzer chiqishni sezadi (`visibilitychange`, `pagehide`, `blur`, ekran
bo'linishi) va `POST /quiz_process/leave` yuboradi. Lekin unga tayanib
bo'lmaydi: talaba boshqa ilovaga o'tishdan oldin aviarejimni yoqsa yoki
JS'ni o'chirsa, so'rov yetib bormaydi. Shuning uchun sahifa ochiq turgan
paytda har bir necha soniyada `heartbeat` keladi; u to'xtasa, keyingi
javob yoki yakunlashda urinish baribir yopiladi.

Telefon fon rejimida JS'ni muzlatadi — heartbeat ham to'xtaydi, ya'ni
boshqa ilovada o'tirgan talaba qaytib kelganda testi yopiq bo'ladi.
"""

import logging

from app.core.redis_client import redis_client

logger = logging.getLogger(__name__)

#: Heartbeat shuncha soniya kelmasa, sahifa yopilgan deb hisoblanadi.
#: Brauzer har 5 soniyada yuboradi; zaxira universitet Wi-Fi'dagi uzilishlar
#: uchun — aks holda sekin tarmoq testni yopib qo'yardi.
HEARTBEAT_TTL_SECONDS = 30

#: Qat'iy testga shuncha soniya ichida, hali javob berilmagan bo'lsa, qaytish
#: mumkin: boshlash javobi tarmoqda yo'qolgan talaba qayta bosganda darhol
#: «ko'chirdi» deb yopilmasin. Keyin qaytish — sahifadan chiqish.
RESUME_WINDOW_SECONDS = 15

#: Sabab matnini server tanlaydi: brauzer faqat kalitni yuboradi. Aks holda
#: o'qituvchi natijalarida istalgan matn paydo bo'lishi mumkin edi.
LEAVE_REASONS = {
    "hidden": "Sahifadan chiqdi",
    "pagehide": "Sahifani yopdi",
    "blur": "Boshqa oynaga o'tdi",
    "split": "Ekranni bo'ldi",
    "heartbeat": "Aloqa uzildi",
    "resume": "Sahifani qayta ochdi",
}
DEFAULT_LEAVE_REASON = "hidden"


def leave_reason_text(key: str | None) -> str:
    return LEAVE_REASONS.get(key or "", LEAVE_REASONS[DEFAULT_LEAVE_REASON])


def _key(attempt_id: int, kind: str = "quiz") -> str:
    """`kind` — urinish turi: `quiz` (Result) yoki `gtest` (elementar test)."""
    return f"{kind}:hb:{attempt_id}"


async def touch(attempt_id: int, kind: str = "quiz") -> None:
    try:
        await redis_client.set(_key(attempt_id, kind), "1", ex=HEARTBEAT_TTL_SECONDS)
    except Exception:
        logger.warning("Heartbeat yozilmadi (%s %s)", kind, attempt_id, exc_info=True)


async def is_alive(attempt_id: int, kind: str = "quiz") -> bool:
    """Sahifa yaqinda tirik bo'lganmi.

    Redis ishlamasa — tirik deb hisoblanadi: Redis uzilishi barcha qat'iy
    testlarni bir vaqtda yopib yubormasligi kerak.
    """
    try:
        return bool(await redis_client.exists(_key(attempt_id, kind)))
    except Exception:
        logger.warning("Heartbeat o'qilmadi (%s %s)", kind, attempt_id, exc_info=True)
        return True


async def first_open(attempt_id: int, kind: str, ttl_seconds: int) -> bool:
    """Test sahifasi shu urinish uchun birinchi marta ochilyaptimi.

    Ikkinchi ochilish — sahifa yangilangan yoki qayta kirilgan. Redis
    ishlamasa — birinchi deb hisoblanadi (yuqoridagi sabab bilan).
    """
    try:
        return bool(await redis_client.set(f"{kind}:opened:{attempt_id}", "1", nx=True, ex=ttl_seconds))
    except Exception:
        logger.warning("Ochilish belgisi yozilmadi (%s %s)", kind, attempt_id, exc_info=True)
        return True


async def forget(attempt_id: int, kind: str = "quiz") -> None:
    try:
        await redis_client.delete(_key(attempt_id, kind))
    except Exception:
        logger.warning("Heartbeat o'chirilmadi (%s %s)", kind, attempt_id, exc_info=True)
