"""Zoom Meeting SDK imzosi (General App, Client ID + Client Secret).

Sir brauzerga hech qachon chiqmaydi: bekend faqat shu imzoni beradi.
Ilgari `integration/zoom/service.py` da edi va dars bo'yicha chaqirilardi;
endi uni seans (`modules/zoom_session`) chaqiradi — vaqt va guruh
tekshiruvidan keyin.
"""

import time

import jwt
from core.config import settings

# Talaba — ishtirokchi (0). O'qituvchi LMS yaratgan uchrashuvni sahifaning
# o'zida host (1) bo'lib boshlaydi — bu rol faqat ZAK bilan birga ishlaydi.
PARTICIPANT_ROLE = 0
HOST_ROLE = 1

#: Zoom: `exp` `iat` dan kamida 1800 soniya keyin bo'lishi shart.
MIN_SIGNATURE_SECONDS = 1800


def sign_meeting(
    meeting_number: str,
    *,
    not_after: int | None = None,
    sdk_key: str | None = None,
    sdk_secret: str | None = None,
    role: int = PARTICIPANT_ROLE,
) -> str:
    """Meeting SDK imzosi (standart — ishtirokchi). `not_after` (unix vaqt) — imzo undan keyin amal qilmaydi.

    `sdk_key`/`sdk_secret` — uchrashuv egasi akkauntidagi SDK ilovasi
    (`zoom_session/accounts.py`); berilmasa — `.env` dagisi.

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
    key = sdk_key or settings.zoom.client_id
    payload = {
        "appKey": key,
        "sdkKey": key,
        "mn": meeting_number,
        "role": role,
        "iat": issued_at,
        "exp": expires_at,
        "tokenExp": expires_at,
    }
    return jwt.encode(payload, sdk_secret or settings.zoom.client_secret, algorithm="HS256")
