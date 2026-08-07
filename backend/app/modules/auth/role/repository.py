import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.lifespan.defaults import ADMIN_ROLE_NAME
from app.modules.auth.permission.model import Permission
from app.modules.auth.role.model import Role, RolePermission
from app.modules.auth.user.model import UserRole

from .schemas import (
    RoleCreateRequest,
    RoleListRequest,
    RoleListResponse,
    RolePermissionAssignRequest,
)

logger = logging.getLogger(__name__)


class RoleRepository:
    async def create_role(self, session: AsyncSession, data: RoleCreateRequest) -> Role:
        # Проверка на существование роли с таким именем
        # Без учёта регистра: везде, где роль ищут по имени, сравнение идёт
        # через func.lower, и «Dekan» рядом с «dekan» означал бы две роли,
        # которые система считает одной.
        stmt_check = select(Role).where(func.lower(Role.name) == data.name.lower())
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{data.name}' already exists",
            )

        new_role = Role(name=data.name)
        session.add(new_role)

        # Auto-assign 'user:me' permission
        stmt_perm = select(Permission).where(Permission.name == "user:me")
        result_perm = await session.execute(stmt_perm)
        user_me_perm = result_perm.scalar_one_or_none()

        if not user_me_perm:
            user_me_perm = Permission(name="user:me")
            session.add(user_me_perm)
            await session.flush()  # Ensure ID is generated

        # Explicitly create RolePermission
        # We need role_id, so flush new_role
        await session.flush()

        role_permission = RolePermission(role_id=new_role.id, permission_id=user_me_perm.id)
        session.add(role_permission)

        try:
            await session.commit()
            # Re-fetch with permissions loaded to satisfy response schema
            stmt_reload = select(Role).options(selectinload(Role.permissions)).where(Role.id == new_role.id)
            result_reload = await session.execute(stmt_reload)
            new_role = result_reload.scalar_one()
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_role

    async def get_role(self, session: AsyncSession, role_id: int) -> Role:
        stmt = select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
        result = await session.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        return role

    async def list_roles(self, session: AsyncSession, request: RoleListRequest) -> RoleListResponse:
        stmt = select(Role).options(selectinload(Role.permissions))
        count_stmt = select(func.count()).select_from(Role)

        if request.name:
            # Один и тот же предикат на выборку и на счётчик: иначе `total`
            # считает нефильтрованные строки и пагинация врёт.
            name_filter = Role.name.ilike(f"%{request.name}%")
            stmt = stmt.where(name_filter)
            count_stmt = count_stmt.where(name_filter)

        stmt = stmt.order_by(desc(Role.created_at)).offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        roles = result.scalars().all()

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return RoleListResponse(total=total, page=request.page, limit=request.limit, roles=roles)

    async def update_role(self, session: AsyncSession, role_id: int, data: RoleCreateRequest) -> Role:
        stmt = select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
        result = await session.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        # Логика обновления "как в User" (явная проверка полей)
        if data.name is not None:
            # Проверяем, не занято ли новое имя другой ролью
            stmt_check = select(Role).where(
                func.lower(Role.name) == data.name.lower(), Role.id != role_id
            )
            existing_role = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing_role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Role name already taken",
                )
            role.name = data.name

        await session.commit()
        result = await session.execute(select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id))
        return result.scalar_one()

    async def delete_role(self, session: AsyncSession, role_id: int, force: bool = False) -> None:
        stmt = select(Role).where(Role.id == role_id)
        result = await session.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        # Admin — единственная роль, которую сервер пропускает мимо всех
        # проверок. Удалить её значит запереть себя снаружи системы до
        # следующей перезагрузки, когда lifespan заведёт её заново уже пустой.
        if role.name == ADMIN_ROLE_NAME:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"«{ADMIN_ROLE_NAME}» rolini o'chirib bo'lmaydi — tizimga kirish yo'qoladi",
            )

        user_count = (
            await session.execute(select(func.count(UserRole.id)).where(UserRole.role_id == role_id))
        ).scalar() or 0

        # user_roles.role_id стоит ON DELETE CASCADE: удаление молча снимет роль
        # со всех, кому она выдана, и они потеряют доступ без всякого следа.
        if user_count and not force:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "requires_confirmation": True,
                    "message": "Bu rolni o'chirish quyidagilarga ta'sir qiladi:",
                    "warnings": [
                        f"{user_count} ta foydalanuvchi bu rolni va u bergan barcha ruxsatlarni yo'qotadi"
                    ],
                },
            )

        await session.delete(role)
        await session.commit()

    async def assign_permissions(self, session: AsyncSession, data: RolePermissionAssignRequest) -> None:
        # 1. Fetch Role
        stmt = select(Role).where(Role.id == data.role_id).options(selectinload(Role.permissions))
        result = await session.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        # 2. Fetch Permissions
        if not data.permission_ids:
            role.permissions = []
        else:
            stmt_perms = select(Permission).where(Permission.id.in_(data.permission_ids))
            result_perms = await session.execute(stmt_perms)
            permissions = result_perms.scalars().all()

            if len(permissions) != len(data.permission_ids):
                found_ids = {p.id for p in permissions}
                missing_ids = set(data.permission_ids) - found_ids
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Permissions with ids {missing_ids} not found",
                )

            # 3. Assign
            role.permissions = list(permissions)

        try:
            await session.commit()
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while assigning permissions",
            )


get_role_repository = RoleRepository()
