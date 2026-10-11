"""Zoom akkauntlari: qaysi kalit bilan ishlash.

Har akkaunt — `ZoomCredentials`. Manba ikki xil:

* `zoom_accounts` jadvali — admin «Zoom akkauntlar» sahifasida qo'shadi;
* `.env` (`APP_CONFIG__ZOOM__*`) — «Asosiy (.env)» akkaunti. `id` si yo'q:
  `zoom_account_id` bo'sh seanslar (jumladan, bu o'zgarishdan oldingilar)
  shu kalitlar bilan ishlaydi. Formada uni `ENV_ACCOUNT_ID` (0) bildiradi.

Bitta akkauntning ikki ilovasi (S2S va SDK) albatta SHU akkauntda
bo'lishi shart: nashr etilmagan SDK ilovasi boshqa akkaunt uchrashuviga
kirmaydi (Zoom xatosi 4011).
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

from core.config import settings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.secret_box import SecretUnreadable, decrypt_secret

from .model import ZoomAccount

logger = logging.getLogger(__name__)

#: Formada va so'rovda `.env` akkauntini bildiradi (jadvalda bunday id yo'q).
ENV_ACCOUNT_ID = 0
ENV_ACCOUNT_NAME = "Asosiy (.env)"


@dataclass(frozen=True)
class ZoomCredentials:
    #: `zoom_accounts.id`; `None` — `.env`.
    id: int | None
    name: str
    host_user: str = ""
    api_account_id: str = ""
    api_client_id: str = ""
    api_client_secret: str = ""
    sdk_key: str = ""
    sdk_secret: str = ""
    webhook_secret: str = ""

    @property
    def api_enabled(self) -> bool:
        return bool(self.api_account_id and self.api_client_id and self.api_client_secret and self.host_user)

    @property
    def sdk_enabled(self) -> bool:
        return bool(self.sdk_key and self.sdk_secret)

    @property
    def cache_key(self) -> str:
        """Token keshi kaliti: sir almashsa, eski token ishlatilmaydi."""
        digest = hashlib.sha256(f"{self.api_client_id}:{self.api_client_secret}".encode()).hexdigest()[:16]
        return f"{self.id or 'env'}:{digest}"


def env_credentials() -> ZoomCredentials:
    z = settings.zoom
    return ZoomCredentials(
        id=None,
        name=ENV_ACCOUNT_NAME,
        host_user=z.api_host_user,
        api_account_id=z.api_account_id,
        api_client_id=z.api_client_id,
        api_client_secret=z.api_client_secret,
        sdk_key=z.client_id,
        sdk_secret=z.client_secret,
        webhook_secret=z.webhook_secret_token,
    )


def _decrypt(value: str | None, *, account: ZoomAccount, field: str) -> str:
    if not value:
        return ""
    try:
        return decrypt_secret(value)
    except SecretUnreadable:
        # JWT siri almashgan: sir bo'sh deb hisoblanadi va admin uni qayta kiritadi.
        logger.warning("Zoom account %s: %s does not decrypt, re-enter it", account.id, field)
        return ""


def credentials_of(account: ZoomAccount) -> ZoomCredentials:
    return ZoomCredentials(
        id=account.id,
        name=account.name,
        host_user=account.host_email or "",
        api_account_id=account.api_account_id or "",
        api_client_id=account.api_client_id or "",
        api_client_secret=_decrypt(account.api_client_secret_encrypted, account=account, field="api secret"),
        sdk_key=account.sdk_key,
        sdk_secret=_decrypt(account.sdk_secret_encrypted, account=account, field="sdk secret"),
        webhook_secret=_decrypt(account.webhook_secret_encrypted, account=account, field="webhook secret"),
    )


async def all_credentials(session: AsyncSession, *, active_only: bool = True) -> list[ZoomCredentials]:
    """Jadvaldagi akkauntlar (id tartibida), oxirida — `.env`, agar sozlangan bo'lsa."""
    stmt = select(ZoomAccount).order_by(ZoomAccount.id)
    if active_only:
        stmt = stmt.where(ZoomAccount.is_active.is_(True))
    result = [credentials_of(row) for row in (await session.execute(stmt)).scalars().all()]
    env = env_credentials()
    if env.sdk_enabled or env.api_enabled:
        result.append(env)
    return result


async def credentials_by_id(session: AsyncSession, account_id: int | None) -> ZoomCredentials | None:
    """`None` yoki `ENV_ACCOUNT_ID` — `.env`; faolsiz akkaunt ham qaytadi (eski seanslar uchun)."""
    if not account_id:
        return env_credentials()
    row = await session.get(ZoomAccount, account_id)
    return credentials_of(row) if row is not None else None
