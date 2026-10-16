from __future__ import annotations

import logging


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.data_scope import resolve_data_scope
from app.core.dependencies.role_checker import _roles_have_permission
from app.core.utils.permission_registry import declare_permission
from app.modules.auth.model import User

from .model import (
    GeneralTestSubject,
    GeneralTestSubjectUser,
)
from app.core.utils.roles import user_is_admin
from app.core.errors import Forbidden
from .subjects import SubjectsMixin
from .general_tests import GeneralTestsMixin
from .questions import QuestionsMixin
from .attempts import AttemptsMixin
from .results import ResultsMixin

logger = logging.getLogger(__name__)


class GeneralTestRepository(SubjectsMixin, GeneralTestsMixin, QuestionsMixin, AttemptsMixin, ResultsMixin):
    # ── Egalik ───────────────────────────────────────────────────────────────
    #
    # Elementar testlarni endi oʻqituvchi ham tuzadi. `created_by_user_id`
    # ilgari ham yozilardi, lekin hech qayerda tekshirilmasdi: roʻyxatlar
    # hammasini qaytarardi, tahrirlash va oʻchirish esa egasiga qaramasdi.
    # Ruxsatni shundayligicha oʻqituvchiga berish — har bir oʻqituvchiga
    # begona testlarni (va ularning savollar bankini) ochib qoʻyish degani
    # edi. Shuning uchun avval egalik, keyin ruxsat.
    #
    # Admin hammasini koʻradi: unga umumiy nazorat kerak.
    #
    # Fanga biriktirilgan foydalanuvchi (`general_test_subject_users`) fanni
    # koʻradi va bankiga faqat savol qoʻshadi (qoʻlda yoki Excel'dan). Fanni
    # tahrirlash, oʻchirish, biriktirishlar, test tuzish, savolni tahrirlash
    # va oʻchirish — egasida: begona savolni buzib qoʻyish mumkin boʻlmasin.

    @staticmethod
    def _is_admin(user: User) -> bool:
        return user_is_admin(user)

    @staticmethod
    async def _sees_all(session: AsyncSession, user: User) -> bool:
        """Koʻrish doirasi «Butun universitet» (`modules/auth/data_scope.py`).

        Bunday rol hamma fan, test va natijani KOʻRADI, lekin boshqarmaydi:
        tahrirlash, oʻchirish va biriktirishlar egasi va adminda qoladi
        (`_can_manage`, `_ensure_owner`).
        """
        return (await resolve_data_scope(session, user)).unrestricted

    async def _own_only(self, session: AsyncSession, stmt, model, user: User):
        """Roʻyxat soʻrovini egasi boʻyicha cheklaydi (butun universitetni koʻradiganga — yoʻq)."""
        if await self._sees_all(session, user):
            return stmt
        return stmt.where(model.created_by_user_id == user.id)

    def _ensure_owner(self, obj, user: User, detail: str) -> None:
        if self._is_admin(user) or obj.created_by_user_id == user.id:
            return
        raise Forbidden("general_test_not_owner", detail)

    #: Barcha fanlarni egasidan qat'i nazar boshqarish: tahrirlash, biriktirish,
    #: test tuzish. Alohida ruxsat — `update:general_test_subject` emas: fan
    #: huquqli har bir rol (masalan, ikki dekanat) faqat O'Z fanini boshqarishi
    #: kerak (`test_general_test_ownership.py`). Bu ruxsatni admin aniq bir
    #: rolga beradi — masalan, egasiz fanda (admin yaratgan «Umumiy») test
    #: tuzadigan nazoratchi.
    MANAGE_ALL_PERMISSION = declare_permission("manage:general_test_all")

    async def _manages_all(self, session: AsyncSession, user: User) -> bool:
        """Admin yoki `MANAGE_ALL_PERMISSION` li rol; so'rov ichida bir marta hisoblanadi."""
        cached = getattr(user, "_general_test_manages_all", None)
        if cached is None:
            cached = self._is_admin(user) or await _roles_have_permission(session, user, self.MANAGE_ALL_PERMISSION)
            user._general_test_manages_all = cached
        return cached

    def _can_manage(self, subject: GeneralTestSubject, user: User, manages_all: bool = False) -> bool:
        return manages_all or self._is_admin(user) or subject.created_by_user_id == user.id

    @staticmethod
    async def _is_member(session: AsyncSession, subject_id: int, user_id: int) -> bool:
        stmt = select(GeneralTestSubjectUser.id).where(
            GeneralTestSubjectUser.subject_id == subject_id, GeneralTestSubjectUser.user_id == user_id
        )
        return (await session.execute(stmt.limit(1))).scalar_one_or_none() is not None


get_general_test_repository = GeneralTestRepository()
