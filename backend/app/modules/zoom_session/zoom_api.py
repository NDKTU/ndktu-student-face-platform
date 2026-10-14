"""Zoom REST API mijozi (Server-to-Server OAuth).

Meeting SDK (`core/utils/zoom_signature.py`) faqat kirish imzosini beradi —
Zoom bizning talabalarimizni bilmaydi. Bu mijoz bilan bekend uchrashuvni
o'zi yaratadi va har bir talabani registrant qiladi: talaba shaxsiy `tk`
token bilan kiradi, uchrashuv raqami va paroli esa endi yetarli emas.

Nega ro'yxatdan o'tish **qo'lda tasdiqlanadi** (`approval_type=1`).
Ro'yxatdan o'tish sahifasi ochiq: raqam va parolni bilgan istalgan odam
o'zini o'zi yozib qo'yardi. Qo'lda tasdiqlashda u kutib qoladi, biz esa
registrantni `auto_approve` bilan qo'shamiz — yuz tasdig'idan keyingina.

Token jarayon ichida keshlanadi (ROYD mijozidagi kabi): Zoom tokeni bir
soat yashaydi, har so'rovda yangisini olish limitni behuda yerdi. Har
metod akkaunt kalitlarini (`accounts.py::ZoomCredentials`) oladi: Zoom
akkauntlari bir nechta va har birining ilovalari o'zida.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from core.config import settings
from fastapi import status

from app.modules.quiz.quiz_process.errors import quiz_error

from .accounts import ZoomCredentials

logger = logging.getLogger(__name__)

TOKEN_URL = "https://zoom.us/oauth/token"
API_URL = "https://api.zoom.us/v2"

#: Token muddati tugashidan shuncha oldin yangilanadi — so'rov yo'lda turganda eskirmasin.
TOKEN_LEEWAY_SECONDS = 60

#: Zoom xato kodi: uchrashuv topilmadi (o'chirilgan yoki boshqa akkauntniki).
MEETING_NOT_FOUND = 3001


class ZoomApiError(Exception):
    def __init__(self, status_code: int, code: int | None, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def api_error(cause: ZoomApiError):
    """Foydalanuvchiga — 502: bu sozlama yoki Zoom nosozligi, uning aybi emas."""
    return quiz_error(
        status.HTTP_502_BAD_GATEWAY,
        "zoom_api_error",
        f"Zoom so'rovni bajarmadi: {cause.message}",
    )


def registrant_token(join_url: str) -> str | None:
    """Registrantning shaxsiy kirish tokeni — `join_url` dagi `tk`."""
    return parse_qs(urlparse(join_url).query).get("tk", [None])[0]


def registrant_join_url(link_url: str, meeting_number: str, token: str) -> str:
    """Registrantning Zoom ilovasi uchun shaxsiy havolasi (`/w/<raqam>?tk=..&pwd=..`).

    Zoom `add_registrant` javobidagi `join_url` bilan bir xil shakl; biz faqat
    tokenni saqlaymiz, havolani uchrashuv havolasidagi domen va paroldan yig'amiz.
    """
    parsed = urlparse(link_url or "")
    host = parsed.hostname or "zoom.us"
    query = {"tk": token}
    pwd = parse_qs(parsed.query).get("pwd", [None])[0]
    if pwd:
        query["pwd"] = pwd
    return f"https://{host}/w/{meeting_number}?{urlencode(query)}"


def zak_token(start_url: str) -> str | None:
    """Host'ning ZAK tokeni — `start_url` dagi `zak` (~2 soat amal qiladi).

    Alohida `/users/{id}/token?type=zak` chaqiruvi kerak emas: u yangi
    ruxsat (scope) talab qilardi, `start_url` esa allaqachon olinadi.
    """
    return parse_qs(urlparse(start_url).query).get("zak", [None])[0]


def _zoom_time(value: datetime) -> str:
    """Bizdagi naiv UTC → Zoom formati (`Z` bilan — zona alohida talqin qilinmaydi)."""
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def _duration_minutes(starts_at: datetime, ends_at: datetime) -> int:
    return max(1, math.ceil((ends_at - starts_at).total_seconds() / 60))


class ZoomApiClient:
    """Har akkauntning tokeni alohida keshlanadi (`ZoomCredentials.cache_key`)."""

    def __init__(self) -> None:
        self._tokens: dict[str, tuple[str, float]] = {}
        self._lock = asyncio.Lock()

    def reset_token(self) -> None:
        self._tokens.clear()

    async def _fetch_token(self, creds: ZoomCredentials) -> str:
        try:
            async with httpx.AsyncClient(timeout=settings.zoom.api_timeout_seconds) as client:
                response = await client.post(
                    TOKEN_URL,
                    params={"grant_type": "account_credentials", "account_id": creds.api_account_id},
                    auth=(creds.api_client_id, creds.api_client_secret),
                )
        except httpx.RequestError as exc:
            logger.warning("Zoom token so'rovi muvaffaqiyatsiz (%s): %s", creds.name, exc)
            raise ZoomApiError(0, None, "Zoom'ga ulanib bo'lmadi") from exc
        if response.status_code != 200:
            # Odatda kalit xato yoki ilova faollashtirilmagan (Activation).
            logger.error("Zoom token bermadi (%s): %s %s", creds.name, response.status_code, response.text[:300])
            raise ZoomApiError(response.status_code, None, "Zoom kalitni qabul qilmadi")
        body = response.json()
        token = body["access_token"]
        expires_at = time.monotonic() + max(0, int(body.get("expires_in") or 3600) - TOKEN_LEEWAY_SECONDS)
        self._tokens[creds.cache_key] = (token, expires_at)
        return token

    async def _access_token(self, creds: ZoomCredentials, *, force_refresh: bool = False) -> str:
        async with self._lock:
            cached = self._tokens.get(creds.cache_key)
            if force_refresh or cached is None or time.monotonic() >= cached[1]:
                return await self._fetch_token(creds)
            return cached[0]

    async def request(self, creds: ZoomCredentials, method: str, path: str, *, json: dict | None = None) -> Any:
        if not creds.api_enabled:
            raise ZoomApiError(0, None, f"«{creds.name}» akkauntida Zoom API sozlanmagan")
        token = await self._access_token(creds)
        for attempt in (1, 2):
            try:
                async with httpx.AsyncClient(timeout=settings.zoom.api_timeout_seconds) as client:
                    response = await client.request(
                        method, f"{API_URL}{path}", json=json, headers={"Authorization": f"Bearer {token}"}
                    )
            except httpx.RequestError as exc:
                logger.warning("Zoom so'rovi muvaffaqiyatsiz: %s %s — %s", method, path, exc)
                raise ZoomApiError(0, None, "Zoom'ga ulanib bo'lmadi") from exc
            # 401 — token eskirgan bo'lishi mumkin: bir marta yangilab qayta urinamiz.
            if response.status_code == 401 and attempt == 1:
                token = await self._access_token(creds, force_refresh=True)
                continue
            break
        if response.status_code >= 400:
            try:
                body = response.json()
            except ValueError:
                body = {}
            message = body.get("message") or response.text[:200] or "Zoom xatosi"
            logger.warning("Zoom %s %s (%s) → %s %s", method, path, creds.name, response.status_code, message)
            raise ZoomApiError(response.status_code, body.get("code"), message)
        return response.json() if response.content else None

    # ── Uchrashuvlar ─────────────────────────────────────────────────────────

    @staticmethod
    def _meeting_body(topic: str, starts_at: datetime, ends_at: datetime) -> dict:
        return {
            "topic": topic[:200],
            "start_time": _zoom_time(starts_at),
            "duration": _duration_minutes(starts_at, ends_at),
            "timezone": "Asia/Tashkent",
            "settings": {
                # Talaba o'qituvchini kutmaydi: kirish baribir faqat shaxsiy
                # token bilan, vaqt oynasini esa server o'zi tekshiradi
                # (`jbh_time=0` — Zoom tomonida qo'shimcha cheklov yo'q).
                # Yangilashda ham yuboriladi — eski uchrashuvlar ham o'tsin.
                "join_before_host": True,
                "jbh_time": 0,
            },
        }

    async def create_meeting(self, creds: ZoomCredentials, topic: str, starts_at: datetime, ends_at: datetime) -> dict:
        """Rejalashtirilgan uchrashuv; javobda `id`, `join_url`, `password`."""
        base = self._meeting_body(topic, starts_at, ends_at)
        body = {
            **base,
            "type": 2,
            "settings": {
                **base["settings"],
                "approval_type": 1,
                "registration_type": 1,
                "registrants_confirmation_email": False,
                "registrants_email_notification": False,
                # Bitta registrant — bitta qurilma: tokenni do'stiga berib
                # yuborsa, ikkalasi bir vaqtda o'tira olmaydi.
                "allow_multiple_devices": False,
                "waiting_room": False,
                "mute_upon_entry": True,
            },
        }
        return await self.request(creds, "POST", f"/users/{creds.host_user}/meetings", json=body)

    async def update_meeting(
        self, creds: ZoomCredentials, meeting_id: int, topic: str, starts_at: datetime, ends_at: datetime
    ) -> None:
        await self.request(
            creds, "PATCH", f"/meetings/{meeting_id}", json=self._meeting_body(topic, starts_at, ends_at)
        )

    async def delete_meeting(self, creds: ZoomCredentials, meeting_id: int) -> None:
        try:
            await self.request(creds, "DELETE", f"/meetings/{meeting_id}")
        except ZoomApiError as cause:
            # Zoom'da qo'lda o'chirilgan — maqsadga erishilgan.
            if cause.code != MEETING_NOT_FOUND and cause.status_code != 404:
                raise

    async def get_meeting(self, creds: ZoomCredentials, meeting_id: int) -> dict:
        return await self.request(creds, "GET", f"/meetings/{meeting_id}")

    async def get_user(self, creds: ZoomCredentials, user: str) -> dict:
        """Akkaunt tekshiruvi: host bormi va litsenziyalimi (`type == 2`)."""
        return await self.request(creds, "GET", f"/users/{user}")

    async def add_registrant(
        self, creds: ZoomCredentials, meeting_id: int, *, email: str, first_name: str, last_name: str
    ) -> dict:
        """Registrant qo'shadi va darhol tasdiqlaydi; javobda `registrant_id`, `join_url`."""
        body = {
            "email": email,
            "first_name": first_name[:64] or "Talaba",
            "last_name": last_name[:64],
            "auto_approve": True,
        }
        return await self.request(creds, "POST", f"/meetings/{meeting_id}/registrants", json=body)


zoom_api = ZoomApiClient()
