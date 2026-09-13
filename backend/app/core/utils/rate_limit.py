"""Rate limit kaliti — foydalanuvchi bo'yicha, IP bo'yicha emas.

`fastapi_limiter` ning standart kaliti `IP + yo'l`. Auditoriyada yoki
yotoqxonada o'tirgan talabalar bitta NAT IP orqasida bo'ladi va bir-birining
limitini yeydi. Yuz nazorati uchun bu halokatli: tekshiruv daqiqada bir marta
ketadi, 30 talabali guruh umumiy limitni darhol to'ldiradi va qolganlari 429
oladi — jurnalda esa ular darsda bo'lmagandek ko'rinardi.

Shuning uchun kalit tokendagi `user_id` dan olinadi. Token yaroqsiz bo'lsa IP
ga qaytamiz: identifier — himoya qatlami, autentifikatsiya emas, va 401 ni
aynan shu yerda tashlash xato bo'lardi. Haqiqiy tekshiruvni `PermissionRequired`
qiladi, u baribir shu so'rovda ishga tushadi.

Global `FastAPILimiter.init(identifier=...)` ataylab ishlatilmadi: u loyihadagi
barcha limitlarni bir vaqtda o'zgartirardi, jumladan `public_quiz` kabi
autentifikatsiyasiz endpointlarni.
"""

import jwt
from core.config import settings
from starlette.requests import Request
from starlette.websockets import WebSocket


def _user_id_from_header(header_value: str) -> int | None:
    """Tokendagi `user_id`, yoki `None` — token yaroqsiz bo'lsa.

    Sessiya bu yerda tekshirilmaydi va `validate_session` chaqirilmaydi: u
    Redis'ga yozadi (sliding TTL) va uni ikkinchi marta chaqirish har so'rovda
    sessiya muddatini bejiz uzaytirardi. Bu yerda kerak bo'lgani — kalit, ya'ni
    sof CPU ishi.
    """
    parts = header_value.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    try:
        payload = jwt.decode(
            parts[1].strip(),
            settings.jwt.access_token_secret,
            algorithms=[settings.jwt.algorithm],
        )
    except jwt.InvalidTokenError:
        # Muddati o'tgan yoki buzuq token — IP bo'yicha cheklaymiz.
        return None
    return payload.get("user_id")


async def user_identifier(request: Request | WebSocket) -> str:
    """`user_id:yo'l` yoki (token yaroqsiz bo'lsa) `IP:yo'l`."""
    path = request.scope["path"]

    header = request.headers.get("Authorization")
    if header:
        user_id = _user_id_from_header(header)
        if user_id is not None:
            return f"user:{user_id}:{path}"

    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return f"{ip}:{path}"
