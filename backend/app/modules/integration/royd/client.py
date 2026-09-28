"""ROYD («Yagona darcha») integratsiya API mijozi.

Ishlash tartibi ROYD hujjatidan olingan (`docs/INTEGRATION.md` §6): biz
OAuth2 `client_credentials` bilan o'z nomimizdan token olamiz va
`/integration/*` yo'llariga murojaat qilamiz. Talaba ma'lumotlari arizaning
o'zi bilan bitta so'rovda ketadi, shuning uchun ROYD talabani oldindan
bilishi shart emas.

Nega nusxa saqlamaymiz. Ikki bazada bir xil murojaat bo'lsa, ular albatta
chetlashadi: holat ROYD'da o'zgaradi, bizdagi nusxa eskiradi va talaba
noto'g'ri holatni ko'radi. Webhook faqat bildirishnoma yaratadi.
"""

import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)


class RoydDisabled(HTTPException):
    """Integratsiya sozlanmagan.

    503, 500 emas: bu nosozlik emas, sozlama yo'q. Frontend shu javobni
    ko'rib bo'limni «ulanmagan» deb ko'rsatadi va qayta urinmaydi.
    """

    def __init__(self) -> None:
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Arizalar tizimi (ROYD) ulanmagan. Administratorga murojaat qiling.",
        )


class RoydClient:
    """Token kesh bilan HTTP mijoz.

    Token 1 soat amal qiladi va refresh token yo'q — muddati tugaganda
    yangisini so'raymiz. Kesh jarayon ichida: har so'rovda token so'rash
    ROYD'ning yozish limitini (daqiqasiga 30) behuda yeb qo'yardi.
    """

    def __init__(self) -> None:
        self._token: str | None = None
        self._expires_at: float = 0.0
        # Bir vaqtda bir necha so'rov kelsa, token bir marta olinadi.
        self._lock = asyncio.Lock()

    # ─────────────────────────────── Token ────────────────────────────────

    async def _fetch_token(self) -> str:
        config = settings.royd
        try:
            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                response = await client.post(
                    f"{config.base_url.rstrip('/')}/api/v1/oauth/token",
                    data={"grant_type": "client_credentials"},
                    auth=(config.client_id, config.client_secret),
                    headers={"Accept": "application/json"},
                )
        except httpx.RequestError as exc:
            logger.warning("ROYD token so'rovi muvaffaqiyatsiz: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arizalar tizimiga ulanib bo'lmadi. Keyinroq urinib ko'ring.",
            ) from exc

        if response.status_code != 200:
            # Xato RFC 6749 formatida: {"error": "invalid_client", ...}.
            # Bu talabaning aybi emas — sozlama xatosi, shuning uchun matn
            # umumiy, tafsilot esa jurnalga tushadi.
            logger.error("ROYD token bermadi: %s %s", response.status_code, response.text[:300])
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arizalar tizimi kalitni qabul qilmadi. Administratorga murojaat qiling.",
            )

        body = response.json()
        token = body.get("access_token")
        if not token:
            logger.error("ROYD javobida access_token yo'q: %s", str(body)[:200])
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arizalar tizimi noto'g'ri javob qaytardi.",
            )
        expires_in = int(body.get("expires_in") or 3600)
        self._token = token
        self._expires_at = time.monotonic() + max(0, expires_in - settings.royd.token_leeway_seconds)
        logger.info("ROYD tokeni olindi, scope: %s", body.get("scope"))
        return token

    async def _access_token(self, *, force_refresh: bool = False) -> str:
        async with self._lock:
            if force_refresh or not self._token or time.monotonic() >= self._expires_at:
                return await self._fetch_token()
            return self._token

    def reset_token(self) -> None:
        """Keshni tozalaydi. Secret yangilanganda yoki testda kerak."""
        self._token = None
        self._expires_at = 0.0

    # ─────────────────────────────── So'rov ───────────────────────────────

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
        files: dict | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        config = settings.royd
        if not config.enabled:
            raise RoydDisabled()

        token = await self._access_token()
        # 401 — token muddati tugagan bo'lishi mumkin. Bir marta yangilab
        # qayta urinamiz: aks holda soat sayin bitta so'rov behuda yo'qolardi.
        for attempt in (1, 2):
            response = await self._send(
                method, path, token=token, json=json, params=params, files=files,
                idempotency_key=idempotency_key,
            )
            if response.status_code == 401 and attempt == 1:
                logger.info("ROYD 401 qaytardi — token yangilanadi")
                token = await self._access_token(force_refresh=True)
                continue
            return self._unwrap(response)
        raise RoydDisabled()  # bu yerga yetib bo'lmaydi

    async def _send(
        self,
        method: str,
        path: str,
        *,
        token: str,
        json: dict | None,
        params: dict | None,
        files: dict | None,
        idempotency_key: str | None,
    ) -> httpx.Response:
        config = settings.royd
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                return await client.request(
                    method,
                    f"{config.base_url.rstrip('/')}/api/v1/integration{path}",
                    headers=headers,
                    json=json,
                    params=params,
                    files=files,
                )
        except httpx.RequestError as exc:
            logger.warning("ROYD so'rovi muvaffaqiyatsiz: %s %s — %s", method, path, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arizalar tizimiga ulanib bo'lmadi. Keyinroq urinib ko'ring.",
            ) from exc

    @staticmethod
    def _unwrap(response: httpx.Response) -> Any:
        if response.status_code >= 400:
            # ROYD xatolari o'zbekcha va foydalanuvchiga tushunarli (masalan
            # «fakultetga registrator biriktirilmagan»), shuning uchun matni
            # saqlanadi. Kalit/scope xatolari esa talabaning aybi emas —
            # ular yashiriladi, aks holda u «ruxsat yo'q» deb o'ylardi.
            if response.status_code in (401, 403):
                logger.error("ROYD kalit/scope xatosi: %s %s", response.status_code, response.text[:300])
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Arizalar tizimi so'rovni qabul qilmadi. Administratorga murojaat qiling.",
                )
            if response.status_code == 429:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Juda ko'p so'rov. Bir daqiqadan keyin urinib ko'ring.",
                    headers={"Retry-After": response.headers.get("Retry-After", "60")},
                )
            detail: Any
            try:
                body = response.json()
                detail = body.get("detail") if isinstance(body, dict) else body
            except ValueError:
                detail = response.text[:300]
            raise HTTPException(status_code=response.status_code, detail=detail or "Arizalar tizimi xatosi")

        if not response.content:
            return None
        return response.json()


royd_client = RoydClient()
