import logging

from core.database.db_helper import db_helper
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.roles import is_admin as user_is_admin
from app.modules.auth.permission.model import Permission
from app.modules.auth.role.model import Role, RolePermission
from app.modules.auth.user.model import User, UserRole
from app.modules.auth.user.service import auth_service

logger = logging.getLogger(__name__)

# HTTPBearer, а не APIKeyHeader: Swagger тогда сам подставляет префикс `Bearer`,
# и сразу для всех роутов, а не только для /user/me.
# auto_error=False: при отсутствии заголовка возвращаем 401 (а не дефолтный 403),
# чтобы фронтовый интерсептор корректно редиректил на /login.
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> int:
    if credentials is None:
        # None приходит и когда заголовка нет, и когда он есть, но без схемы
        # `Bearer` — HTTPBearer эти случаи не различает, поэтому текст покрывает оба.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header (expected 'Bearer <token>')",
        )
    # Схему уже разобрал HTTPBearer — дальше идёт голый токен.
    # Единая валидация: декод + Single Active Session + продление скользящего idle-TTL.
    return await auth_service.validate_session(credentials.credentials)


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

        # Единственная точка правды о том, кто админ (F06): раньше здесь
        # сравнение было точным, а в репозиториях — без учёта регистра.
        if user_is_admin(user):
            return user  # Админ имеет доступ ко всему

        # Есть ли у пользователя это право. Одним запросом, а не двумя: раньше
        # перед ним шла отдельная выборка «а существует ли вообще такое право»,
        # и она выполнялась на КАЖДОМ запросе не-админа только ради более
        # внятного текста ошибки. Теперь её задают лишь тогда, когда проверка
        # не прошла, — то есть на успешном пути её нет вовсе.
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
            # Отличаем «права нет у пользователя» от «права нет в системе»:
            # второе означает, что приложение не перезапускали после появления
            # нового эндпоинта, и сообщение должно вести к перезапуску.
            known = (
                await session.execute(
                    select(Permission.id).where(Permission.name == self.permission_name)
                )
            ).scalars().first()
            if not known:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"Permission '{self.permission_name}' not found. "
                        "Restart the app to sync permissions."
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: user lacks '{self.permission_name}' permission",
            )

        return user
