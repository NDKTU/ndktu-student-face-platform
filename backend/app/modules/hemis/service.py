import logging

import httpx
from core.config import settings
from core.utils.password_hash import verify_password
from fastapi import HTTPException, Request
from modules.user.service import auth_service
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.faculty.repository import get_faculty_repository
from app.modules.group.repository import get_group_repository
from app.modules.hemis.model import HemisTransaction
from app.modules.result.repository import get_result_repository
from app.modules.student.repository import student_repository
from app.modules.user.repository import get_user_repository

from .schemas import (
    HemisLoginRequest,
    HemisLoginResponse,
    HemisTransactionListResponse,
    HemisTransactionResponse,
)

logger = logging.getLogger(__name__)


class HemisLoginService:
    # ------------------------------------------------------------------ #
    #  LOGIN
    # ------------------------------------------------------------------ #
    async def hemis_login(
        self,
        session: AsyncSession,
        data: HemisLoginRequest,
        request: Request,
    ) -> HemisLoginResponse:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        user = await get_user_repository.find_by_username(session, data.login)

        if user and user.password:
            if verify_password(data.password, user.password):
                access_token, refresh_token = await auth_service.create_session_tokens(user.id)

                student_id = await student_repository.get_id_by_user_id(session, user.id)
                await self._log_transaction(
                    session,
                    login=data.login,
                    login_type="local",
                    status="success",
                    user_id=user.id,
                    student_id=student_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
                return HemisLoginResponse(access_token=access_token, refresh_token=refresh_token)
            else:
                logger.warning(
                    f"Local login failed for user {data.login} (password mismatch), attempting Hemis fallback."
                )
        else:
            logger.info(f"User {data.login} not found locally or has no password, attempting Hemis login.")

        try:
            return await self.request_to_hemis(session, data, ip_address=ip_address, user_agent=user_agent)
        except HTTPException as exc:
            await self._log_transaction(
                session,
                login=data.login,
                login_type="hemis_api",
                status="failed",
                user_id=user.id if user else None,
                student_id=None,
                ip_address=ip_address,
                user_agent=user_agent,
                error_message=exc.detail,
            )
            raise

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
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> HemisLoginResponse:
        me_data = await self._fetch_hemis_data(data.login, data.password)
        user = await self.save_user_data(session, data.login, data.password, me_data)

        access_token, refresh_token = await auth_service.create_session_tokens(user.id)

        student_id = await student_repository.get_id_by_user_id(session, user.id)
        await self._log_transaction(
            session,
            login=data.login,
            login_type="hemis_api",
            status="success",
            user_id=user.id,
            student_id=student_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return HemisLoginResponse(access_token=access_token, refresh_token=refresh_token)

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
        await get_user_repository.ensure_role(session, user, "Student")

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

    async def _log_transaction(
        self,
        session: AsyncSession,
        *,
        login: str,
        login_type: str,
        status: str,
        user_id: int | None = None,
        student_id: int | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        error_message: str | None = None,
    ) -> HemisTransaction:
        transaction = HemisTransaction(
            user_id=user_id,
            student_id=student_id,
            login=login,
            login_type=login_type,
            status=status,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            error_message=error_message,
        )
        session.add(transaction)
        await session.commit()
        return transaction

    # ------------------------------------------------------------------ #
    #  TRANSACTION QUERIES
    # ------------------------------------------------------------------ #
    async def get_transactions(
        self,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        login: str | None = None,
        status_filter: str | None = None,
        login_type: str | None = None,
    ) -> HemisTransactionListResponse:
        stmt = select(HemisTransaction)

        if login:
            stmt = stmt.where(HemisTransaction.login.ilike(f"%{login}%"))
        if status_filter:
            stmt = stmt.where(HemisTransaction.status == status_filter)
        if login_type:
            stmt = stmt.where(HemisTransaction.login_type == login_type)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        stmt = stmt.order_by(desc(HemisTransaction.created_at)).offset((page - 1) * page_size).limit(page_size)
        result = await session.execute(stmt)
        items = result.scalars().all()

        return HemisTransactionListResponse(
            items=[HemisTransactionResponse.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    async def get_transaction_by_id(self, session: AsyncSession, transaction_id: int) -> HemisTransactionResponse:
        stmt = select(HemisTransaction).where(HemisTransaction.id == transaction_id)
        result = await session.execute(stmt)
        transaction = result.scalar_one_or_none()

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found")

        return HemisTransactionResponse.model_validate(transaction)

    async def get_my_transactions(
        self,
        session: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> HemisTransactionListResponse:
        stmt = select(HemisTransaction).where(HemisTransaction.user_id == user_id)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        stmt = stmt.order_by(desc(HemisTransaction.created_at)).offset((page - 1) * page_size).limit(page_size)
        result = await session.execute(stmt)
        items = result.scalars().all()

        return HemisTransactionListResponse(
            items=[HemisTransactionResponse.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        )


hemis_service = HemisLoginService()
