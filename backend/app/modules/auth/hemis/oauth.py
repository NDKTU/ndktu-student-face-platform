"""Вход через OAuth HEMIS (authorization code).

Зачем: при входе по паролю наш сервер сам стучится в `/rest/v1/auth/login`,
и HEMIS считает все попытки всех студентов попытками одного IP. Около пяти
входов в минуту — и он отвечает 429 CAPTCHA_REQUIRED всем подряд (замерено по
логам 07–12.10.2026). Здесь пароль вводится на странице HEMIS в браузере
человека: лимит и капча достаются ему, а не нам. Наш сервер делает только два
запроса — обмен кода на токен и чтение профиля, оба по client_secret.

Учётные записи здесь не создаются. Студенты приезжают ночным импортом
(`student_sync.py`) уже с группой, преподаватели — синхронизацией с EPOS.
Кого нет у нас, того не пускаем: человек без группы не увидит ни одного теста,
а заводить его здесь значило бы плодить записи, которые некому разобрать.
"""

import logging
import secrets
from urllib.parse import urlencode

import httpx
from core.config import settings
from core.redis_client import redis_client
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Student, Teacher, User
from app.modules.auth.user.active_check import ensure_user_active
from app.modules.auth.user.service import auth_service

from .schemas import HemisLoginResponse
from .service import HemisLoginService

logger = logging.getLogger(__name__)

#: Сколько живёт `state`: человек успевает ввести пароль и решить капчу.
STATE_TTL_SECONDS = 600

_STATE_KEY = "hemis:oauth:state:{}"

#: Под каким ключом студенческий портал отдаёт номер студента, не
#: зафиксировано — как и у сотрудников, проверяем известные варианты.
STUDENT_ID_KEYS = ("student_id_number", "login", "username")

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


class HemisOAuthService:
    async def authorize_url(self, portal: str) -> str:
        """Адрес страницы входа HEMIS с одноразовым `state`."""
        base = settings.hemis.oauth_portals().get(portal)
        if not base:
            raise _error(404, "hemis_oauth_disabled", "HEMIS orqali kirish sozlanmagan")

        # state связывает ответ HEMIS с тем, кто начал вход (защита от CSRF),
        # и заодно помнит портал: callback у обоих порталов один.
        state = secrets.token_urlsafe(32)
        await redis_client.set(_STATE_KEY.format(state), portal, ex=STATE_TTL_SECONDS)

        query = urlencode(
            {
                "response_type": "code",
                "client_id": settings.hemis.oauth_client_id,
                "redirect_uri": settings.hemis.oauth_redirect_uri,
                "state": state,
            }
        )
        return f"{base}/oauth/authorize?{query}"

    async def complete(self, session: AsyncSession, code: str, state: str) -> tuple[User, HemisLoginResponse]:
        # getdel — state одноразовый: повтор того же callback'а не войдёт второй раз.
        portal = await redis_client.getdel(_STATE_KEY.format(state))
        base = settings.hemis.oauth_portals().get(portal) if portal else None
        if not base:
            raise _error(
                400,
                "hemis_oauth_state_invalid",
                "Kirish havolasi eskirgan. «HEMIS orqali kirish» tugmasini qaytadan bosing.",
            )

        profile = await self._fetch_profile(base, portal, code)
        if portal == "employee":
            user = await self._find_teacher(session, profile)
        else:
            user = await self._find_student(session, profile)

        ensure_user_active(user)
        access_token = await auth_service.create_session_token(user.id)
        logger.info("HEMIS OAuth (%s): вошёл %s", portal, user.username)
        return user, HemisLoginResponse(access_token=access_token)

    # ------------------------------------------------------------------ #
    #  HTTP
    # ------------------------------------------------------------------ #
    async def _fetch_profile(self, base: str, portal: str, code: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                token_resp = await client.post(
                    f"{base}/oauth/access-token",
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "client_id": settings.hemis.oauth_client_id,
                        "client_secret": settings.hemis.oauth_client_secret,
                        "redirect_uri": settings.hemis.oauth_redirect_uri,
                    },
                    headers={"Accept": "application/json"},
                )
                token = self._json(token_resp).get("access_token") if token_resp.status_code == 200 else None
                if not token:
                    # Код ответа и тело HEMIS — без нашего секрета: он в запросе, не в ответе.
                    logger.error(
                        "HEMIS OAuth (%s): обмен кода не удался, HTTP %s — %s",
                        portal,
                        token_resp.status_code,
                        HemisLoginService._body_excerpt(token_resp),
                    )
                    raise _error(
                        502,
                        "hemis_oauth_token_failed",
                        "HEMIS kirishni tasdiqlamadi. Qaytadan urinib ko'ring.",
                    )

                user_resp = await client.get(
                    f"{base}/oauth/api/user",
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                )
                profile = self._json(user_resp) if user_resp.status_code == 200 else {}
                # Часть эндпоинтов HEMIS заворачивает ответ в {"success", "data"}.
                if isinstance(profile.get("data"), dict):
                    profile = profile["data"]
                if not profile:
                    logger.error(
                        "HEMIS OAuth (%s): профиль не отдан, HTTP %s — %s",
                        portal,
                        user_resp.status_code,
                        HemisLoginService._body_excerpt(user_resp),
                    )
                    raise _error(
                        502,
                        "hemis_oauth_profile_failed",
                        "HEMIS profil ma'lumotlarini bermadi. Qaytadan urinib ko'ring.",
                    )
                return profile
        except httpx.RequestError as exc:
            logger.error("HEMIS OAuth (%s) недоступен: %s", portal, exc)
            raise _error(503, "hemis_unavailable", "HEMIS javob bermayapti. Birozdan keyin urinib ko'ring.")

    @staticmethod
    def _json(resp: httpx.Response) -> dict:
        try:
            data = resp.json()
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    # ------------------------------------------------------------------ #
    #  КТО ВОШЁЛ
    # ------------------------------------------------------------------ #
    @staticmethod
    def _candidates(profile: dict, keys: tuple[str, ...]) -> list[str]:
        values = (profile.get(key) for key in keys)
        return list(dict.fromkeys(str(v).strip() for v in values if v is not None and str(v).strip()))

    async def _find_student(self, session: AsyncSession, profile: dict) -> User:
        candidates = self._candidates(profile, STUDENT_ID_KEYS)
        if candidates:
            user = (
                await session.execute(
                    select(User)
                    .join(Student, Student.user_id == User.id)
                    .where(Student.student_id_number.in_(candidates))
                    .limit(1)
                )
            ).scalar_one_or_none()
            if user is not None:
                return user

        # Ключи — без значений: в профиле персональные данные.
        logger.warning(
            "HEMIS OAuth: студент не найден (кандидаты %s). Ключи профиля: %s",
            candidates,
            sorted(profile.keys()),
        )
        raise _error(
            403,
            "hemis_oauth_student_not_found",
            "Talaba tizimda topilmadi. Ma'lumotlaringiz hali yuklanmagan bo'lishi mumkin — "
            "administratorga murojaat qiling.",
        )

    async def _find_teacher(self, session: AsyncSession, profile: dict) -> User:
        candidates = self._candidates(profile, HemisLoginService.EMPLOYEE_ID_KEYS)
        if candidates:
            user = (
                await session.execute(
                    select(User)
                    .join(Teacher, Teacher.user_id == User.id)
                    .where(Teacher.hemis_id.in_(candidates))
                    .limit(1)
                )
            ).scalar_one_or_none()
            if user is not None:
                return user

        logger.warning(
            "HEMIS OAuth: сотрудник не найден (кандидаты %s). Ключи профиля: %s",
            candidates,
            sorted(profile.keys()),
        )
        raise _error(
            403,
            "hemis_oauth_employee_not_found",
            "Xodim tizimda topilmadi. EduPlan bilan sinxronlashni kuting yoki administratorga murojaat qiling.",
        )


hemis_oauth_service = HemisOAuthService()
