import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.permission.model import Permission

from .schemas import (
    PermissionListRequest,
    PermissionListResponse,
)

logger = logging.getLogger(__name__)


class PermissionRepository:
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


get_permission_repository = PermissionRepository()
