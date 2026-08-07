"""Справочник прав — только на чтение.

Права выводятся из кода: `core/lifespan/discovery.py` собирает имена из
`PermissionRequired(...)` по всем роутам, `core/lifespan/permissions.py` их
досоздаёт. Записи через API убраны намеренно — они умели только рассинхронить БД
с кодом, но не починить: `POST` заводил имя, которое никто не проверяет; `PUT`
переименовывал право, а `PermissionRequired` ищет его по имени, поэтому доступ
пропадал у всех не-админских ролей разом, и рестарт воссоздавал исходное имя уже
новой строкой без привязок; `DELETE` снимал право со всех ролей каскадом
(`role_permissions.permission_id` — ON DELETE CASCADE) с тем же итогом.
"""

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_permission_repository
from .schemas import (
    PermissionCreateResponse,
    PermissionListRequest,
    PermissionListResponse,
)

router = APIRouter(
    tags=["Permission"],
    prefix="/permission",
)


@router.get("/{permission_id}", response_model=PermissionCreateResponse)
async def get_permission(
    permission_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:permission")),
):
    return await get_permission_repository.get_permission(session=session, permission_id=permission_id)


@router.get("/", response_model=PermissionListResponse)
async def list_permissions(
    data: PermissionListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:permission")),
):
    return await get_permission_repository.list_permissions(session=session, request=data)
