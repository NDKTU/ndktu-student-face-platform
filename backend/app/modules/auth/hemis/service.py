import logging

import httpx
from core.config import settings
from core.utils.password_hash import verify_password
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.student.repository import student_repository
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
                access_token = await auth_service.create_session_token(user.id)
                return HemisLoginResponse(access_token=access_token)
            else:
                logger.warning(
                    f"Local login failed for user {data.login} (password mismatch), attempting Hemis fallback."
                )
        else:
            logger.info(f"User {data.login} not found locally or has no password, attempting Hemis login.")

        return await self.request_to_hemis(session, data)

    # ------------------------------------------------------------------ #
    #  HEMIS API REQUEST
    # ------------------------------------------------------------------ #
    async def _fetch_hemis_data(self, login: str, password: str) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                login_resp = await client.post(
                    settings.hemis.login_url,
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
                    settings.hemis.me_url,
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
        # Факультет и группу только ищем, не заводим. Создать группу больше
        # нечем: speciality_id обязателен, а HEMIS кафедру не присылает — в
        # его ответе есть faculty, specialty и group, но не кафедра, так что
        # цепочку specialities → kafedras восстановить не из чего.
        #
        # Прежний get_or_create заводил недостающее сам, и это было опаснее:
        # стоило HEMIS переименовать факультет — появлялся второй, а студенты
        # молча делились между старым и новым.
        if faculty_id:
            faculty = await get_faculty_repository.get_faculty(session, faculty_id)
        else:
            faculty_name = self._extract_name(me_data.get("faculty"))
            faculty = await get_faculty_repository.find_by_name(session, faculty_name)
            if not faculty:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"«{faculty_name}» fakulteti tizimda ro'yxatdan o'tmagan. "
                        "Dekanatga murojaat qiling."
                    ),
                )

        if group_id:
            group = await get_group_repository.get_group(session, group_id)
        else:
            group_name = self._extract_name(me_data.get("group"))
            group = await get_group_repository.find_by_name(session, group_name)
            if not group:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"«{group_name}» guruhi tizimda ro'yxatdan o'tmagan. "
                        "Dekanatga murojaat qiling."
                    ),
                )

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
