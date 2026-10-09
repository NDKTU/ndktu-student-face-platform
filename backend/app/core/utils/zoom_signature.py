"""Zoom Meeting SDK imzosi (General App, Client ID + Client Secret).

Sir brauzerga hech qachon chiqmaydi: bekend faqat shu imzoni beradi.
Ilgari `integration/zoom/service.py` da edi va dars bo'yicha chaqirilardi;
endi uni seans (`modules/zoom_session`) chaqiradi — vaqt va guruh
tekshiruvidan keyin.
"""

import time

import jwt
from core.config import settings

# Talaba doim ishtirokchi: uchrashuvni o'qituvchi Zoom ilovasida boshlaydi,
# shuning uchun host roli (1) va ZAK token kerak emas.
PARTICIPANT_ROLE = 0

#: Zoom: `exp` `iat` dan kamida 1800 soniya keyin bo'lishi shart.
MIN_SIGNATURE_SECONDS = 1800


def sign_meeting(meeting_number: str, *, not_after: int | None = None) -> str:
    """Ishtirokchi imzosi. `not_after` (unix vaqt) — imzo undan keyin amal qilmaydi.

    Zoom imzoni faqat kirishda tekshiradi. Muddat seans oxiri bilan
    cheklanadi, lekin Zoom talabiga ko'ra `iat` dan kamida 30 daqiqa: aks
    holda oxirgi yarim soatda kirgan talabaning imzosi rad etilardi. Seansdan
    keyin yangi imzo baribir berilmaydi — buni server hal qiladi.
    """
    now = int(time.time())
    # `iat` biroz orqaga: server va Zoom soatlari farq qilsa, imzo
    # «kelajakdan» deb rad etilardi.
    issued_at = now - 30
    expires_at = now + settings.zoom.signature_ttl_seconds
    if not_after is not None:
        expires_at = max(issued_at + MIN_SIGNATURE_SECONDS, min(expires_at, not_after))
    payload = {
        "appKey": settings.zoom.client_id,
        "sdkKey": settings.zoom.client_id,
        "mn": meeting_number,
        "role": PARTICIPANT_ROLE,
        "iat": issued_at,
        "exp": expires_at,
        "tokenExp": expires_at,
    }
    return jwt.encode(payload, settings.zoom.client_secret, algorithm="HS256")
