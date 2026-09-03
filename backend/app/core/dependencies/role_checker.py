import logging

from core.database.db_helper import db_helper
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole
from app.modules.auth.user.service import auth_service

logger = logging.getLogger(__name__)

# auto_error=False: при отсутствии заголовка возвращаем 401 (а не дефолтный 403),
# чтобы фронтовый интерсептор корректно редиректил на /login.
api_key_header = APIKeyHeader(name="Authorization", auto_error=False)


async def get_current_user_id(token: str | None = Depends(api_key_header)) -> int:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    # Единая валидация: декод + Single Active Session + продление скользящего idle-TTL.
    return await auth_service.validate_session(token)


class PermissionRequired:
    def __init__(self, permission_name: str):
        self.permission_name = permission_name

    async def __call__(
        self,
        user_id: int = Depends(get_current_user_id),
        session: AsyncSession = Depends(db_helper.session_getter),
    ) -> User:
        # Загружаем пользователя с ролями один раз
        user_stmt = select(User).where(User.id == user_id).options(selectinload(User.roles))
        result = await session.execute(user_stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # Проверяем, является ли пользователь админом
        is_admin = any(role.name == "Admin" for role in user.roles)

        if is_admin:
            return user  # Админ имеет доступ ко всему

        # Для не-админов проверяем конкретное разрешение
        # Permissions are created at startup by init_db, no need to create here
        perm_stmt = select(Permission).where(Permission.name == self.permission_name)
        perm_result = await session.execute(perm_stmt)
        perm_obj = perm_result.scalar_one_or_none()

        if not perm_obj:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{self.permission_name}' not found. Restart the app to sync permissions.",
            )

        # 2. Проверяем наличие права у пользователя
        perm_check_stmt = (
            select(Permission.id)
            .join(RolePermission)
            .join(Role)
            .join(UserRole)
            .where(UserRole.user_id == user_id, Permission.name == self.permission_name)
        )
        perm_check_result = await session.execute(perm_check_stmt)
        has_permission = perm_check_result.scalars().first()

        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: user lacks '{self.permission_name}' permission",
            )

        return user


async def user_has_permission(session: AsyncSession, user: User, permission_name: str) -> bool:
    """Проверка права уже загруженного пользователя, без 403.

    `PermissionRequired` годится только как зависимость роута: она бросает
    исключение. Здесь право нужно как ветвление — например, «есть read:student
    → отдаём всех студентов, нет → только свою группу».
    """
    if any(role.name.lower() == "admin" for role in user.roles):
        return True

    stmt = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, Permission.name == permission_name)
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalars().first() is not None
