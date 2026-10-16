"""Ruxsatlar ro'yxati.

`auth/router.py` dan ajratilgan — u endi faqat bo'limlarni ulaydi.
"""

import logging

from app.core.database.db_helper import db_helper
from app.core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession


from app.modules.auth.permission.repository import get_permission_repository
from app.modules.auth.permission.schemas import (
    PermissionListRequest,
    PermissionListResponse,
    PermissionResponse,
)

logger = logging.getLogger(__name__)


# ============================================================================
#  PERMISSION
# ============================================================================
permission_router = APIRouter(
    tags=["Permission"],
    prefix="/permission",
)


@permission_router.get("/{permission_id}", response_model=PermissionResponse)
async def get_permission(
    permission_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:permission")),
):
    return await get_permission_repository.get_permission(session=session, permission_id=permission_id)


@permission_router.get("/", response_model=PermissionListResponse)
async def list_permissions(
    data: PermissionListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:permission")),
):
    return await get_permission_repository.list_permissions(session=session, request=data)
