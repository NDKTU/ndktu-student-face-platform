from datetime import datetime, timedelta, timezone

import jwt
from core.config import settings


def create_face_ws_token(user_id: int, quiz_id: int, ttl_minutes: int) -> str:
    """Issue a short-lived JWT for the face-detection WebSocket.

    Signed with the shared INTERNAL_SERVICE_TOKEN so the face-detection
    service can verify the token without calling back to the main backend.
    """
    payload = {
        "sub": str(user_id),
        "quiz_id": quiz_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(
        payload,
        settings.face_service.internal_token,
        algorithm=settings.jwt.algorithm,
    )


# ── Ochiq test uchun mehmon tokeni ──────────────────────────────────────────
# Mehmonda hisob yo'q, shuning uchun oddiy sessiya tokeni berilmaydi: bu token
# faqat bitta urinishga tegishli va tizimda hech qanday huquq bermaydi.
GUEST_TOKEN_TYPE = "guest_quiz"


def create_guest_quiz_token(result_id: int, quiz_id: int, ttl_minutes: int) -> str:
    payload = {
        "typ": GUEST_TOKEN_TYPE,
        "result_id": result_id,
        "quiz_id": quiz_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt.access_token_secret, algorithm=settings.jwt.algorithm)


def decode_guest_quiz_token(token: str) -> dict:
    """Tokenni ochadi. Yaroqsiz bo'lsa — `jwt` xatosi ko'tariladi."""
    payload = jwt.decode(token, settings.jwt.access_token_secret, algorithms=[settings.jwt.algorithm])
    if payload.get("typ") != GUEST_TOKEN_TYPE:
        raise jwt.InvalidTokenError("not a guest quiz token")
    return payload
