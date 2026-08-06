import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.permission.model import Permission

from .schemas import (
    PermissionCreateRequest,
    PermissionListRequest,
    PermissionListResponse,
)

logger = logging.getLogger(__name__)


class PermissionRepository:
    async def create_permission(self, session: AsyncSession, data: PermissionCreateRequest) -> Permission:
        stmt_check = select(Permission).where(Permission.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Permission '{data.name}' already exists",
            )

        new_permission = Permission(name=data.name)
        session.add(new_permission)

        try:
            await session.commit()
            await session.refresh(new_permission)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating permission %r: %s", data.name, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Permission '{data.name}' conflicts with an existing record",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating permission %r", data.name)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_permission

    async def get_permission(self, session: AsyncSession, permission_id: int) -> Permission:
        stmt = select(Permission).where(Permission.id == permission_id)
        result = await session.execute(stmt)
        permission = result.scalar_one_or_none()

        if not permission:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

        return permission

    async def list_permissions(self, session: AsyncSession, request: PermissionListRequest) -> PermissionListResponse:
        stmt = select(Permission)

        if request.name:
            stmt = stmt.where(Permission.name.ilike(f"%{request.name}%"))

        stmt = stmt.order_by(desc(Permission.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        permissions = result.scalars().all()

        count_stmt = select(func.count()).select_from(Permission)
        if request.name:
            count_stmt = count_stmt.where(Permission.name.ilike(f"%{request.name}%"))

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return PermissionListResponse(total=total, page=request.page, limit=request.limit, permissions=permissions)

    async def update_permission(
        self, session: AsyncSession, permission_id: int, data: PermissionCreateRequest
    ) -> Permission:
        stmt = select(Permission).where(Permission.id == permission_id)
        result = await session.execute(stmt)
        permission = result.scalar_one_or_none()

        if not permission:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

        if data.name is not None:
            stmt_check = select(Permission).where(Permission.name == data.name, Permission.id != permission_id)
            existing_permission = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing_permission:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Permission name already taken",
                )
            permission.name = data.name

        await session.commit()
        await session.refresh(permission)
        return permission

    async def delete_permission(self, session: AsyncSession, permission_id: int) -> None:
        stmt = select(Permission).where(Permission.id == permission_id)
        result = await session.execute(stmt)
        permission = result.scalar_one_or_none()

        if not permission:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

        await session.delete(permission)
        await session.commit()


get_permission_repository = PermissionRepository()
