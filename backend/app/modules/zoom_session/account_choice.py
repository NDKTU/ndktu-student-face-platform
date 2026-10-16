"""Seans qaysi Zoom akkauntida: bo'sh litsenziya yoki havola egasi (4011 dan qochish)."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


from .accounts import (
    ENV_ACCOUNT_ID,
    ZoomCredentials,
    all_credentials,
    credentials_by_id,
    env_credentials,
)
from .model import ZoomSession
from .schemas import (
    ZoomSessionRequest,
)
from .zoom_api import ZoomApiError, zoom_api
from .errors import _not_configured, _link_required, _account_not_found, _account_cannot_create, _account_busy, _no_free_account, _account_required


class ZoomAccountChoiceMixin:
    @staticmethod
    async def _session_credentials(session: AsyncSession, zs: ZoomSession) -> ZoomCredentials:
        creds = await credentials_by_id(session, zs.zoom_account_id)
        if creds is None:
            raise _not_configured()
        return creds

    @staticmethod
    async def _account_is_busy(
        session: AsyncSession, creds: ZoomCredentials, starts_at: datetime, ends_at: datetime, exclude_id: int | None
    ) -> bool:
        """Akkaunt hostida shu vaqtga to'g'ri keladigan LMS uchrashuvi bormi.

        Faqat API yaratganlari: ularning hosti aniq — akkaunt hosti. Qo'lda
        qo'yilgan havolaning hosti boshqa foydalanuvchi bo'lishi mumkin.
        """
        account_filter = (
            ZoomSession.zoom_account_id == creds.id if creds.id else ZoomSession.zoom_account_id.is_(None)
        )
        stmt = select(ZoomSession.id).where(
            account_filter,
            ZoomSession.zoom_managed.is_(True),
            ZoomSession.is_active.is_(True),
            ZoomSession.starts_at < ends_at,
            ZoomSession.ends_at > starts_at,
        )
        if exclude_id is not None:
            stmt = stmt.where(ZoomSession.id != exclude_id)
        return (await session.execute(stmt.limit(1))).first() is not None

    async def _choose_for_new_meeting(
        self, session: AsyncSession, data: ZoomSessionRequest
    ) -> ZoomCredentials:
        """Uchrashuvni yaratadigan akkaunt: tanlangani yoki birinchi bo'shi."""
        accounts = await all_credentials(session)
        if data.zoom_account_id is not None:
            chosen = next((a for a in accounts if (a.id or ENV_ACCOUNT_ID) == data.zoom_account_id), None)
            if chosen is None:
                raise _account_not_found()
            if not (chosen.api_enabled and chosen.sdk_enabled):
                raise _account_cannot_create()
            if await self._account_is_busy(session, chosen, data.starts_at, data.ends_at, None):
                raise _account_busy()
            return chosen
        candidates = [a for a in accounts if a.api_enabled and a.sdk_enabled]
        if not candidates:
            raise _link_required()
        for creds in candidates:
            if not await self._account_is_busy(session, creds, data.starts_at, data.ends_at, None):
                return creds
        raise _no_free_account()

    async def _choose_for_link(
        self, session: AsyncSession, requested: int | None, meeting_id: int
    ) -> ZoomCredentials:
        """Qo'lda qo'yilgan havola qaysi akkauntniki.

        Tanlangan bo'lsa — o'sha. Akkaunt bitta bo'lsa — u. Aks holda har
        API'li akkauntdan uchrashuvni so'raymiz: topgani — egasi. SDK imzosi
        boshqa akkauntniki bo'lsa, talaba kira olmaydi (4011), shuning uchun
        taxmin qilmaymiz.
        """
        accounts = await all_credentials(session)
        if requested is not None:
            chosen = next((a for a in accounts if (a.id or ENV_ACCOUNT_ID) == requested), None)
            if chosen is None:
                raise _account_not_found()
            return chosen
        with_sdk = [a for a in accounts if a.sdk_enabled]
        if len(with_sdk) <= 1:
            # Akkaunt umuman yo'q bo'lsa ham seans yaratiladi (oldingidek):
            # kirishda «Zoom sozlanmagan» deyiladi.
            return with_sdk[0] if with_sdk else accounts[0] if accounts else env_credentials()
        for creds in (a for a in with_sdk if a.api_enabled):
            try:
                await zoom_api.get_meeting(creds, meeting_id)
                return creds
            except ZoomApiError:
                continue
        raise _account_required()
