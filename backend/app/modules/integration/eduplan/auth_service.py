import logging
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.core.database.models_registry  # noqa: F401
from app.core.utils.password_hash import hash_password_async
from app.modules.auth.model import Teacher, User
from app.modules.auth.user.active_check import ensure_user_active
from app.modules.auth.user.repository import get_user_repository
from app.modules.auth.user.service import auth_service
from app.modules.organization_structure.model import Kafedra

from .credentials import effective_config

logger = logging.getLogger(__name__)


class EduPlanAuthService:
    """Аутентификация пользователей (преподавателей и сотрудников) через EduPlan API."""

    async def login(
        self,
        session: AsyncSession,
        username: str,
        password: str,
    ) -> str:
        """Аутентифицирует пользователя в EduPlan, синхронизирует его данные и создаёт сессию."""
        cfg = await effective_config(session)
        base_url = cfg.base_url.rstrip("/")

        # 1. Запрос токена в EduPlan (OAuth2 password flow)
        try:
            async with httpx.AsyncClient(timeout=cfg.timeout) as client:
                token_resp = await client.post(
                    f"{base_url}/api/v1/auth/access-token",
                    data={
                        "grant_type": "password",
                        "username": username,
                        "password": password,
                    },
                    headers={"Accept": "application/json"},
                )

                if token_resp.status_code != 200:
                    logger.warning("EduPlan login failed for %s: HTTP %s", username, token_resp.status_code)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="EduPlan: Login yoki parol noto'g'ri",
                    )

                token_data = token_resp.json()
                eduplan_token = token_data.get("access_token")
                if not eduplan_token:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="EduPlan javobida access_token topilmadi",
                    )

                # 2. Получение профиля текущего пользователя
                headers = {
                    "Accept": "application/json",
                    "Authorization": f"Bearer {eduplan_token}",
                }
                if cfg.active_role:
                    headers["X-Active-Role"] = cfg.active_role

                me_resp = await client.get(f"{base_url}/api/v1/users/me", headers=headers)
                if me_resp.status_code != 200:
                    logger.error("EduPlan /users/me failed: HTTP %s", me_resp.status_code)
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="EduPlan'dan foydalanuvchi ma'lumotlarini olib bo'lmadi",
                    )

                user_data: dict[str, Any] = me_resp.json()

        except httpx.RequestError as e:
            logger.exception("EduPlan service connection error for %s: %s", username, e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"EduPlan xizmati bilan bog'lanib bo'lmadi: {e}",
            )

        # 3. Сохранение или обновление пользователя в локальной БД
        user = await self._save_eduplan_user(session, username, password, user_data)

        # 4. Проверка активности пользователя
        ensure_user_active(user)

        # 5. Создание сессии в Redis и выдача JWT платформы
        access_token = await auth_service.create_session_token(user.id)
        logger.info("Foydalanuvchi %s EduPlan orqali muvaffaqiyatli kirdi (user_id=%s)", username, user.id)
        return access_token

    async def _save_eduplan_user(
        self,
        session: AsyncSession,
        username: str,
        plain_password: str,
        user_data: dict[str, Any],
    ) -> User:
        user = await get_user_repository.find_by_username(session, username)
        hashed_password = await hash_password_async(plain_password)

        if not user:
            user = User(
                username=username,
                password=hashed_password,
                is_active=user_data.get("is_active", True),
                auth_source="eduplan",
            )
            session.add(user)
            await session.flush()
            await session.refresh(user, attribute_names=["roles"])
            logger.info("EduPlan SSO: yaratildi yangi User(username=%s)", username)
        else:
            # Parol EPOS'dagi bilan sinxron turadi: o'qituvchi u yerda
            # almashtirsa, keyingi kirishda bizdagi xesh ham yangilanadi.
            user.password = hashed_password
            user.auth_source = "eduplan"
            if "is_active" in user_data:
                user.is_active = user_data["is_active"]

        # 1. Barcha EPOS SSO foydalanuvchilariga majburiy ravishda "teacher" roli beriladi
        await get_user_repository.ensure_role(session, user, "teacher")

        # 2. Qo'shimcha rollar mavjud bo'lsa, ularni ham biriktiramiz
        eduplan_roles = user_data.get("roles") or []
        if isinstance(eduplan_roles, list):
            for r in eduplan_roles:
                if isinstance(r, dict):
                    role_str = str(r.get("name") or r.get("slug") or "").strip().lower()
                else:
                    role_str = str(r).strip().lower()
                if role_str and role_str != "teacher":
                    await get_user_repository.ensure_role(session, user, role_str)

        # Привязка / создание записи преподавателя (Teacher)
        department_id = user_data.get("department_id")
        first_name = (user_data.get("first_name") or "").strip()
        last_name = (user_data.get("last_name") or "").strip()
        third_name = (user_data.get("third_name") or "").strip()
        name_field = (user_data.get("name") or "").strip()

        if not first_name and name_field:
            parts = name_field.split()
            last_name = parts[0] if len(parts) > 0 else ""
            first_name = parts[1] if len(parts) > 1 else ""
            third_name = " ".join(parts[2:]) if len(parts) > 2 else ""

        full_name = f"{last_name} {first_name} {third_name}".strip() or name_field or username

        # Поиск кафедры по external_id или id
        kafedra_id: int | None = None
        if department_id is not None:
            kafedra_stmt = select(Kafedra).where(
                (Kafedra.external_id == str(department_id)) | (Kafedra.id == department_id)
            )
            kafedra = (await session.execute(kafedra_stmt)).scalars().first()
            if kafedra:
                kafedra_id = kafedra.id

        # Поиск существующей записи Teacher
        teacher_stmt = select(Teacher).where(Teacher.user_id == user.id)
        teacher = (await session.execute(teacher_stmt)).scalars().first()

        if not teacher and user_data.get("id"):
            teacher_by_ext = select(Teacher).where(
                (Teacher.external_id == str(user_data["id"])) & (Teacher.external_source == "eduplan")
            )
            teacher = (await session.execute(teacher_by_ext)).scalars().first()
            if teacher:
                teacher.user_id = user.id

        if not teacher:
            teacher = Teacher(
                user_id=user.id,
                kafedra_id=kafedra_id,
                first_name=first_name or username,
                last_name=last_name or "",
                third_name=third_name or "",
                full_name=full_name,
                external_id=str(user_data.get("id")) if user_data.get("id") else None,
                external_source="eduplan",
            )
            session.add(teacher)
        else:
            teacher.first_name = first_name or teacher.first_name
            teacher.last_name = last_name or teacher.last_name
            teacher.third_name = third_name or teacher.third_name
            teacher.full_name = full_name or teacher.full_name
            if kafedra_id and not teacher.kafedra_id:
                teacher.kafedra_id = kafedra_id
            if user_data.get("id") and not teacher.external_id:
                teacher.external_id = str(user_data["id"])
                teacher.external_source = "eduplan"

        await session.commit()
        await session.refresh(user, attribute_names=["roles"])
        return user


eduplan_auth_service = EduPlanAuthService()
