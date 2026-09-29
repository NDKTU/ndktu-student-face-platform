"""Audit yozuvini qo'yish.

Ikkita qoida butun modulni belgilaydi.

**Audit hech qachon asosiy ishni buzmaydi.** Yozib bo'lmasa (baza band,
ustun mos kelmadi, nima bo'lsa ham) — xato yutiladi va dastur jurnaliga
tushadi. Aks holda audit qo'shilishi kirishni ishdan chiqarishi mumkin
edi: foydalanuvchi tizimga kira olmay qolardi, chunki uning kirgani
yozilmadi. Bu kulgili, lekin aynan shunday nosozliklar bo'ladi.

**Kirish hodisalari alohida tranzaksiyada yoziladi.** Kirish paytida
chaqiruvchining tranzaksiyasi `rollback` bo'lishi mumkin (masalan parol
noto'g'ri), lekin urinishning o'zi qayd etilishi kerak.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

# DIQQAT: `core.database.db_helper` — `app.core.database.db_helper` EMAS.
# Loyihada ikkala yo'l ham ishlatiladi va Python ularni ikki alohida modul
# deb biladi, ya'ni `db_helper` ham ikkita bo'ladi (ikkita ulanish hovuzi).
# So'rov yo'lidagi kod va testlar birinchisini ishlatadi — mos kelmasa,
# yozuv boshqa bazaga tushib ketadi.
from core.database.db_helper import db_helper
from app.modules.audit.model import AuditLog

logger = logging.getLogger(__name__)

#: Ustun chegaralari (`model.py`). Qiymatlar tashqaridan keladi: login —
#: forma maydoni, `User-Agent` va `X-Active-Role` — sarlavhalar. Ular
#: ustunga sig'masa `INSERT` yiqiladi, xato esa yutiladi va urinish
#: jurnalga TUSHMAY qoladi — ya'ni uzun login yuborib yozuvdan qochish
#: mumkin bo'lardi. Shuning uchun har biri kesiladi.
_USERNAME_LIMIT = 150
_ROLE_LIMIT = 64
_IP_LIMIT = 64
_UA_LIMIT = 500


def _clip(value: object, limit: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] or None


def request_meta(request: Request | None) -> dict:
    """So'rovdan IP, brauzer va faol rolni oladi."""
    if request is None:
        return {}
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    return {
        "ip": _clip(ip, _IP_LIMIT),
        "user_agent": _clip(request.headers.get("user-agent"), _UA_LIMIT),
        "role": _clip(request.headers.get("x-active-role"), _ROLE_LIMIT),
    }


def _build(
    *,
    event: str,
    user_id: int | None,
    username: str | None,
    object_type: str | None,
    object_id: str | int | None,
    summary: str | None,
    meta: dict | None,
    request: Request | None,
) -> AuditLog:
    info = request_meta(request)
    return AuditLog(
        event=event,
        user_id=user_id,
        username=_clip(username, _USERNAME_LIMIT),
        role=info.get("role"),
        object_type=object_type,
        object_id=None if object_id is None else str(object_id),
        summary=summary,
        meta=meta,
        ip=info.get("ip"),
        user_agent=info.get("user_agent"),
    )


async def record(
    session: AsyncSession,
    *,
    event: str,
    user_id: int | None = None,
    username: str | None = None,
    object_type: str | None = None,
    object_id: str | int | None = None,
    summary: str | None = None,
    meta: dict | None = None,
    request: Request | None = None,
) -> None:
    """Chaqiruvchining tranzaksiyasiga yozuv qo'shadi.

    `commit` chaqiruvchida qoladi: hodisa o'zi sabab bo'lgan o'zgarish
    bilan bitta tranzaksiyada yozilsin. O'zgarish orqaga qaytsa, yozuv ham
    qaytadi — bo'lmagan ish haqidagi yozuv chalg'itadi.
    """
    try:
        session.add(
            _build(
                event=event,
                user_id=user_id,
                username=username,
                object_type=object_type,
                object_id=object_id,
                summary=summary,
                meta=meta,
                request=request,
            )
        )
    except Exception:
        logger.exception("Audit yozuvini qo'shib bo'lmadi: %s", event)


async def record_standalone(
    *,
    event: str,
    user_id: int | None = None,
    username: str | None = None,
    object_type: str | None = None,
    object_id: str | int | None = None,
    summary: str | None = None,
    meta: dict | None = None,
    request: Request | None = None,
) -> None:
    """O'z tranzaksiyasida yozadi.

    Kirish hodisalari uchun: parol noto'g'ri bo'lsa chaqiruvchi xato
    ko'taradi va uning tranzaksiyasi qaytadi, urinish esa qayd etilishi
    kerak.
    """
    try:
        async with db_helper.session_factory() as session:
            if username is None and user_id is not None:
                # Chaqiruvchida login yo'q (masalan sessiya siqib
                # chiqarilganda faqat `user_id` ma'lum). Yozuvda login
                # bo'lmasa, ro'yxatda kim ekani ko'rinmasdi. Bu yerda
                # so'rash arzon: bunday hodisalar kam.
                from sqlalchemy import select

                from app.modules.auth.model import User

                username = (
                    await session.execute(select(User.username).where(User.id == user_id))
                ).scalar_one_or_none()
            session.add(
                _build(
                    event=event,
                    user_id=user_id,
                    username=username,
                    object_type=object_type,
                    object_id=object_id,
                    summary=summary,
                    meta=meta,
                    request=request,
                )
            )
            await session.commit()
    except Exception:
        # Audit asosiy ishni buzmaydi — shuning uchun yutiladi.
        logger.exception("Audit yozuvini saqlab bo'lmadi: %s", event)
