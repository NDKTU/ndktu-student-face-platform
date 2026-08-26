import logging

import httpx
from core.config import settings
from core.utils.password_hash import verify_password
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Teacher, User
from app.modules.auth.student.repository import student_repository
from app.modules.auth.user.active_check import ensure_user_active
from app.modules.auth.user.repository import get_user_repository
from app.modules.auth.user.service import auth_service
from app.modules.organization_structure.faculty.repository import get_faculty_repository
from app.modules.organization_structure.group.repository import get_group_repository
from app.modules.quiz.result.repository import get_result_repository

from .schemas import HemisLoginRequest, HemisLoginResponse

logger = logging.getLogger(__name__)


class HemisLoginService:
    # ------------------------------------------------------------------ #
    #  LOGIN
    # ------------------------------------------------------------------ #
    async def hemis_login(
        self,
        session: AsyncSession,
        data: HemisLoginRequest,
    ) -> HemisLoginResponse:
        user = await get_user_repository.find_by_username(session, data.login)

        if user and user.password:
            if verify_password(data.password, user.password):
                # Локальный вход остаётся аварийным путём для администратора,
                # не зависящим от доступности внешних систем.
                ensure_user_active(user)
                access_token = await auth_service.create_session_token(user.id)
                return HemisLoginResponse(access_token=access_token)
            else:
                logger.warning(
                    f"Local login failed for user {data.login} (password mismatch), attempting Hemis fallback."
                )
        else:
            logger.info(f"User {data.login} not found locally or has no password, attempting Hemis login.")

        try:
            return await self.request_to_hemis(session, data)
        except HTTPException:
            # Студенческий портал не признал логин. Если настроен сотруднический,
            # пробуем его: это может быть преподаватель.
            if not settings.hemis.employee_login_enabled:
                raise
            logger.info("Студенческий Hemis отклонил %s, пробуем сотруднический", data.login)
            return await self.employee_login(session, data)

    # ------------------------------------------------------------------ #
    #  ВХОД ПРЕПОДАВАТЕЛЯ ЧЕРЕЗ СОТРУДНИЧЕСКИЙ HEMIS
    # ------------------------------------------------------------------ #
    #: Под каким ключом сотруднический Hemis отдаёт идентификатор человека,
    #: точно не зафиксировано, поэтому проверяем несколько известных вариантов.
    EMPLOYEE_ID_KEYS = ("employee_id_number", "employee_id", "hemis_id", "id_number", "uid")

    async def employee_login(
        self,
        session: AsyncSession,
        data: HemisLoginRequest,
    ) -> HemisLoginResponse:
        """Аутентифицирует преподавателя во внешнем Hemis и опознаёт его у нас.

        Учётные записи здесь не создаются: преподаватель должен уже приехать
        синхронизацией с EduPlan. Иначе мы завели бы пользователя без кафедры и
        без осмысленных прав, а его связь с нагрузкой всё равно бы не собралась.
        """
        me_data = await self._fetch_employee_data(data.login, data.password)

        hemis_id = next(
            (str(me_data[key]) for key in self.EMPLOYEE_ID_KEYS if me_data.get(key)),
            None,
        )
        if not hemis_id:
            logger.error(
                "Сотруднический Hemis не вернул идентификатор сотрудника. Ключи ответа: %s",
                sorted(me_data.keys()),
            )
            raise HTTPException(
                status_code=502,
                detail="Hemis не вернул идентификатор сотрудника",
            )

        teacher = (await session.execute(select(Teacher).where(Teacher.hemis_id == hemis_id))).scalar_one_or_none()

        if teacher is None:
            logger.warning("Вход преподавателя %s: hemis_id %s не найден в зеркале", data.login, hemis_id)
            raise HTTPException(
                status_code=403,
                detail=(
                    "Сотрудник не найден в системе. Дождитесь синхронизации с EduPlan или обратитесь к администратору."
                ),
            )

        user = await session.get(User, teacher.user_id)
        if user is None:
            raise HTTPException(status_code=403, detail="У сотрудника нет учётной записи")

        ensure_user_active(user)

        access_token = await auth_service.create_session_token(user.id)
        logger.info("Преподаватель %s вошёл через Hemis (hemis_id=%s)", user.username, hemis_id)
        return HemisLoginResponse(access_token=access_token)

    async def _fetch_employee_data(self, login: str, password: str) -> dict:
        return await self._fetch_from_hemis(
            login,
            password,
            settings.hemis.employee_login_url,
            settings.hemis.employee_me_url,
        )

    # ------------------------------------------------------------------ #
    #  HEMIS API REQUEST
    # ------------------------------------------------------------------ #
    async def _fetch_hemis_data(self, login: str, password: str) -> dict:
        return await self._fetch_from_hemis(
            login,
            password,
            settings.hemis.login_url,
            settings.hemis.me_url,
        )

    @staticmethod
    async def _fetch_from_hemis(login: str, password: str, login_url: str, me_url: str) -> dict:
        """Логин и получение профиля. Протокол одинаков для обоих порталов Hemis."""
        try:
            async with httpx.AsyncClient() as client:
                login_resp = await client.post(
                    login_url,
                    json={"login": login, "password": password},
                    headers={"Accept": "application/json"},
                )
                if login_resp.status_code != 200:
                    raise HTTPException(status_code=400, detail="Hemis login failed")

                login_data = login_resp.json()
                if not login_data.get("success"):
                    raise HTTPException(status_code=400, detail="Hemis login returned unsuccessful")

                token = login_data["data"]["token"]

                me_resp = await client.get(
                    me_url,
                    headers={"Authorization": f"Bearer {token}"},
                )
                if me_resp.status_code != 200:
                    raise HTTPException(status_code=400, detail="Hemis ME endpoint failed")

                me_result = me_resp.json()
                if not me_result.get("success"):
                    raise HTTPException(status_code=400, detail="Hemis ME returned unsuccessful")

                return me_result["data"]
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Hemis service unavailable: {str(e)}",
            )

    async def request_to_hemis(
        self,
        session: AsyncSession,
        data: HemisLoginRequest,
    ) -> HemisLoginResponse:
        me_data = await self._fetch_hemis_data(data.login, data.password)
        user = await self.save_user_data(session, data.login, data.password, me_data)

        access_token = await auth_service.create_session_token(user.id)

        return HemisLoginResponse(access_token=access_token)

    # ------------------------------------------------------------------ #
    #  ADMIN PREVIEW & SYNC
    # ------------------------------------------------------------------ #
    async def preview_hemis_data(self, session: AsyncSession, data: HemisLoginRequest) -> dict:
        me_data = await self._fetch_hemis_data(data.login, data.password)

        user = await get_user_repository.find_by_username(session, data.login)
        user_id = user.id if user else None

        existing_results_list = []
        if user_id:
            existing_results_list = await get_result_repository.get_recent_by_user(session, user_id, limit=10)

        faculty_name = self._extract_name(me_data.get("faculty")) or "Unknown"
        faculty_id = await get_faculty_repository.find_id_by_name(session, faculty_name)

        group_name = self._extract_name(me_data.get("group")) or "Unknown"
        group_id, suggested_group = await get_group_repository.find_id_by_name_fuzzy(session, group_name)

        return {
            "hemis_data": me_data,
            "user_id": user_id,
            "user_exists": user_id is not None,
            "faculty_id": faculty_id,
            "faculty_exists": faculty_id is not None,
            "group_id": group_id,
            "group_exists": group_id is not None,
            "existing_results": existing_results_list,
            "suggested_group": suggested_group,
        }

    async def sync_hemis_data(self, session: AsyncSession, data: HemisLoginRequest) -> dict:
        me_data = await self._fetch_hemis_data(data.login, data.password)
        user = await self.save_user_data(
            session=session,
            username=data.login,
            password=data.password,
            me_data=me_data,
            faculty_id=data.faculty_id,
            group_id=data.group_id,
        )
        return {
            "success": True,
            "message": "Student data synced successfully",
            "user_id": user.id,
        }

    # ------------------------------------------------------------------ #
    #  SAVE USER DATA
    # ------------------------------------------------------------------ #
    async def save_user_data(
        self,
        session: AsyncSession,
        username: str,
        password: str,
        me_data: dict,
        faculty_id: int | None = None,
        group_id: int | None = None,
    ):
        # Faculty
        if faculty_id:
            faculty = await get_faculty_repository.get_faculty(session, faculty_id)
        else:
            faculty_name = self._extract_name(me_data.get("faculty")) or "Unknown"
            faculty = await get_faculty_repository.get_or_create(session, faculty_name)

        # Group
        if group_id:
            group = await get_group_repository.get_group(session, group_id)
        else:
            group_name = self._extract_name(me_data.get("group")) or "Unknown"
            group = await get_group_repository.get_or_create(session, group_name, faculty.id)

        # User — repo hashes internally and stores both hash + plaintext
        user = await get_user_repository.get_or_create_for_hemis(session, username, password)
        await get_user_repository.ensure_role(session, user, "student")

        # Student
        await student_repository.upsert_for_hemis(session, user.id, group.id, faculty.name, me_data)

        await session.commit()
        await session.refresh(user)
        return user

    # ------------------------------------------------------------------ #
    #  HELPERS
    # ------------------------------------------------------------------ #
    def _extract_name(self, data) -> str:
        if isinstance(data, dict):
            return data.get("name", "")
        if isinstance(data, str):
            return data
        return ""


hemis_service = HemisLoginService()
