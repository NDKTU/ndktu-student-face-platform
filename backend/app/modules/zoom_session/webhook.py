"""Zoom webhook: `POST /api/zoom/webhook`.

Marketplace → ilova → Feature → Event Subscriptions'da shu manzil
yoziladi — barcha akkauntlar uchun bitta. Autentifikatsiya — imzo
(`x-zm-signature`), token emas: chaqiruvchi Zoom serveri. Sir — o'sha
sahifadagi «Secret Token»; har akkauntniki o'zida (`zoom_accounts`,
`.env` dagisi — `APP_CONFIG__ZOOM__WEBHOOK_SECRET_TOKEN`). Imzo qaysi
akkaunt siriga mos kelsa, hodisa o'shaniki: URL tekshiruvida
(`endpoint.url_validation`) `account_id` bo'lmaydi, shuning uchun sir
akkaunt id'si bo'yicha emas, imzo bo'yicha topiladi.

Imzo: `v0=` + HMAC-SHA256(secret, `v0:{x-zm-request-timestamp}:{xom tana}`).
Vaqt yangiligi tekshirilmaydi: takroriy hodisa `uq_zoom_participant_event`
tufayli baribir ikkinchi marta yozilmaydi, Zoom esa qayta urinishlarni
kechiktirib yuboradi.
"""

import hashlib
import hmac
import json
import logging

from core.database.db_helper import db_helper
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from .accounts import all_credentials
from .repository import zoom_session_repository as repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/zoom", tags=["Zoom webhook"])


def _hmac(secret: str, message: str) -> str:
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def _matching_secret(secrets: list[str], body: bytes, timestamp: str | None, signature: str | None) -> str:
    """Imzosi mos kelgan sir; hech biri mos kelmasa — 401."""
    if not timestamp or not signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Imzo ko'rsatilmagan")
    message = f"v0:{timestamp}:{body.decode('utf-8', errors='replace')}"
    for secret in secrets:
        if hmac.compare_digest(signature, "v0=" + _hmac(secret, message)):
            return secret
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Imzo mos kelmadi")


@router.post("/webhook")
async def receive_webhook(request: Request, session: AsyncSession = Depends(db_helper.session_getter)):
    # Faolsiz akkaunt ham: uning tugayotgan uchrashuvlari hodisasi kelaveradi.
    secrets = list(
        dict.fromkeys(c.webhook_secret for c in await all_credentials(session, active_only=False) if c.webhook_secret)
    )
    if not secrets:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Zoom webhook sozlanmagan")
    body = await request.body()
    secret = _matching_secret(
        secrets, body, request.headers.get("x-zm-request-timestamp"), request.headers.get("x-zm-signature")
    )
    try:
        payload = json.loads(body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON noto'g'ri") from exc

    # «Validate» tugmasi: Zoom manzil bizniki ekanini shu javob bilan tekshiradi.
    if payload.get("event") == "endpoint.url_validation":
        plain = str((payload.get("payload") or {}).get("plainToken") or "")
        return {"plainToken": plain, "encryptedToken": _hmac(secret, plain)}

    # Bizga tegishli bo'lmagan hodisa ham 200: aks holda Zoom uni qayta-qayta yuborardi.
    recorded = await repo.record_participant_event(session, payload)
    return {"accepted": recorded}
