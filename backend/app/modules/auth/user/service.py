import logging

from app.core.utils.password_hash import verify_and_migrate
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Role, Student, Teacher, User
from app.modules.auth.session import SessionService
from app.modules.integration.eduplan.auth_service import eduplan_auth_service

from .active_check import ensure_user_active
from .schemas import UserLoginRequest, UserLoginResponse
from app.core.errors import AppError, Unauthorized

logger = logging.getLogger(__name__)


class UserService(SessionService):
    """Kirish va joriy foydalanuvchi. Sessiya qismi — `SessionService` dan
    (`auth/session.py`); `auth_service.create_session_token(...)` kabi eski
    chaqiruvlar o'zgarishsiz ishlaydi."""

    async def login(self, session: AsyncSession, data: UserLoginRequest) -> UserLoginResponse:
        user = await self.get_user_by_username(session, data.username)

        # EPMOS loginning registriga e'tibor beradi ("MM001" bilan "mm001" —
        # boshqa-boshqa). Bizda esa aynan EPMOS yozgan ko'rinish saqlanadi,
        # shuning uchun tashqariga foydalanuvchi yozgani emas, bazadagisi
        # yuboriladi — xodim loginni kichik harf bilan yozsa ham kiradi.
        external_username = user.username if user else data.username

        # EPOS'dan kelgan hisob uchun haqiqat manbai — EPOS. Mahalliy xesh
        # avval tekshirilganda, o'qituvchi EPOS'da parolini almashtirgach ham
        # eski parol bizda ishlayverardi.
        if user and user.auth_source == "eduplan":
            try:
                access_token = await eduplan_auth_service.login(session, external_username, data.password)
                return UserLoginResponse(type="Bearer", access_token=access_token)
            except (HTTPException, AppError) as exc:
                # 401 — parol haqiqatan noto'g'ri, mahalliy xeshga o'tmaymiz.
                if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                    raise
                # EPOS javob bermayapti: dars vaqtida tizimni to'xtatib
                # qo'ymaslik uchun oxirgi ma'lum parolga ruxsat beramiz.
                logger.warning("EduPlan unavailable (%s), falling back to local hash for %s", exc.status_code, data.username)
            except Exception as exc:  # noqa: BLE001 — kutilmagan nosozlik ham to'xtatmasin
                logger.error("EduPlan login error for %s: %s", data.username, exc)

        if user and user.password:
            matched, upgraded_hash = await verify_and_migrate(data.password, user.password)
            if matched:
                ensure_user_active(user)
                # Eski 12-round xesh 10 ga koʻchadi — har kim oʻzining birinchi
                # kirishida, parol tiklashsiz. Xeshdan parolni tiklab
                # bo'lmagani uchun buni ommaviy qilishning iloji yo'q.
                if upgraded_hash:
                    user.password = upgraded_hash
                    await session.commit()
                access_token = await self.create_session_token(user.id)
                return UserLoginResponse(type="Bearer", access_token=access_token)
            logger.warning(
                "Local login failed for user %s (password mismatch), attempting EduPlan fallback.",
                data.username,
            )

        # EduPlan SSO: hali bizda yo'q xodimlar shu yerdan kiradi.
        try:
            access_token = await eduplan_auth_service.login(session, external_username, data.password)
            return UserLoginResponse(type="Bearer", access_token=access_token)
        except (HTTPException, AppError) as exc:
            # Mahalliy hisob uchun EduPlan xabarini ko'rsatish chalg'itadi:
            # odam «EduPlan qabul qilmadi» ni o'qib, integratsiyani tuzatishga
            # kirishadi, aslida esa oddiy parol xato. EduPlan matni faqat
            # bizda umuman yo'q hisoblar uchun ma'noli.
            if user is not None and user.password:
                raise Unauthorized("invalid_credentials", "Login yoki parol noto'g'ri") from exc
            raise
        except Exception as e:
            logger.error("EduPlan login fallback failed: %s", e)
            raise Unauthorized("invalid_credentials", "Login yoki parol noto'g'ri")

    async def get_current_user(self, session: AsyncSession, token: str) -> User:
        # Декод + проверка Single Active Session + продление idle-TTL в одном месте.
        user_id = await self.validate_session(token)

        stmt = (
            select(User)
            .where(User.id == user_id)
            .options(
                selectinload(User.roles).selectinload(Role.permissions),
                selectinload(User.teacher).selectinload(Teacher.kafedra),
                selectinload(User.student).selectinload(Student.group),
            )
            # `PermissionRequired` shu so'rovda `user.roles` ni faol rolga
            # toraytirgan bo'lishi mumkin (`apply_active_role`). `/user/me`
            # esa ko'rinish tanlovi uchun barcha rollarni qaytarishi kerak.
            .execution_options(populate_existing=True)
        )
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise Unauthorized("token_invalid", "Invalid authentication credentials")

        return user

    async def get_user_by_id(self, session: AsyncSession, user_id: int):
        stmt = select(User).where(User.id == user_id).options(selectinload(User.roles))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_by_username(self, session: AsyncSession, username: str):
        """Loginni registrga bog'liq bo'lmagan holda topadi.

        Bazada loginlar EPMOS'dagi ko'rinishida saqlanadi ("MM001"), foydalanuvchi
        esa uni kichik harflar bilan yozishi mumkin. Qat'iy taqqoslashda bunday
        xodim umuman topilmas, mahalliy xesh tekshirilmasdan qolardi.

        `scalars().first()`: nazariy jihatdan "MM001" va "mm001" yonma-yon
        turishi mumkin, va bunday holat butun kirishni xatoga uchratmasligi kerak.
        """
        stmt = (
            select(User)
            .where(func.lower(User.username) == username.strip().lower())
            .options(selectinload(User.roles))
            .order_by(User.id)
        )
        result = await session.execute(stmt)
        return result.scalars().first()


auth_service = UserService()
