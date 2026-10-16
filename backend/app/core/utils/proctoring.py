"""Yuz nazorati: kadrda yuz ko'rinmasa testni avtomatik yakunlash.

Ogohlantirish (5 soniya yuz yo'q) har bir kamerali testda doim ishlaydi —
u testni to'xtatmaydi. Avtomatik yakunlash esa jiddiy jazo: talaba
daftarga qaragani yoki yorug'lik yomonligi uchun testdan chiqib ketishi
mumkin. Shuning uchun uni faqat `AUTO_FINISH_PERMISSION` ruxsati bor rol
(standart — faqat Admin) yoqadi, o'zgartiradi va o'chiradi. Oddiy test va
elementar test bir xil qoidadan foydalanadi.

Qiymat (`no_face_finish_seconds`): `NULL` — o'chiq, son — necha soniya yuz
ko'rinmasa test yakunlanadi. So'rovda `None` — o'zgarmaydi (maydonni
yubormaydigan oynalar sozlamani jimgina o'chirib yubormasin), `0` — o'chirish.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.utils.permission_registry import declare_permission
from app.core.utils.roles import user_is_admin
from app.core.errors import Forbidden

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.auth.model import User

AUTO_FINISH_PERMISSION = declare_permission("manage:proctoring_auto_finish")

NO_FACE_FINISH_MIN_SECONDS = 15
NO_FACE_FINISH_MAX_SECONDS = 600


def validate_no_face_seconds(value: int | None) -> int | None:
    """Pydantic validatori uchun: `None` yoki `0` yoki chegaradagi son."""
    if value in (None, 0):
        return value
    if not NO_FACE_FINISH_MIN_SECONDS <= value <= NO_FACE_FINISH_MAX_SECONDS:
        low, high = NO_FACE_FINISH_MIN_SECONDS, NO_FACE_FINISH_MAX_SECONDS
        raise ValueError(f"Yuz ko'rinmasa yakunlash vaqti {low}–{high} soniya bo'lishi kerak")
    return value


async def resolve_no_face_finish(
    session: AsyncSession,
    user: User | None,
    *,
    current: int | None,
    requested: int | None,
    proctoring_mode: str,
) -> int | None:
    """Saqlanadigan qiymat. O'zgartirish ruxsatsiz bo'lsa — 403.

    Kamerasiz rejimda sozlama ma'nosiz — o'chadi (rejimni almashtirish bu
    ruxsatga bog'liq emas: kamerani butunlay o'chirish allaqachon mumkin).
    """
    if proctoring_mode != "face":
        return None
    if requested is None:
        return current
    target = requested or None
    if target == current:
        return current
    is_admin = user is not None and user_is_admin(user)
    # Kech import: bu modulni sxemalar ham import qiladi (validator), ular esa
    # `role_checker` va modellarni tortib kelmasligi kerak.
    from app.core.dependencies.role_checker import _roles_have_permission

    if user is not None and not is_admin and not await _roles_have_permission(session, user, AUTO_FINISH_PERMISSION):
        raise Forbidden(
            "proctoring_auto_finish_forbidden",
            "Yuz ko'rinmasa testni yakunlash sozlamasini faqat ruxsati bor foydalanuvchi o'zgartiradi",
        )
    return target
