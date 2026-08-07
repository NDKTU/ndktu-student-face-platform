from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_role_repository
from .schemas import (
    RoleCreateRequest,
    RoleCreateResponse,
    RoleListRequest,
    RoleListResponse,
    RolePermissionAssignRequest,
)

router = APIRouter(
    tags=["Role"],
    prefix="/role",
)


@router.post(
    "/",
    response_model=RoleCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_role(
    data: RoleCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:role")),
):
    result = await get_role_repository.create_role(session=session, data=data)
    return result


@router.get("/{role_id}", response_model=RoleCreateResponse)
async def get_role(
    role_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:role")),
):
    return await get_role_repository.get_role(session=session, role_id=role_id)


@router.get("/", response_model=RoleListResponse)
async def list_roles(
    data: RoleListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:role")),
):
    return await get_role_repository.list_roles(session=session, request=data)


@router.put(
    "/{role_id}",
    response_model=RoleCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_role(
    role_id: int,
    data: RoleCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:role")),
):
    result = await get_role_repository.update_role(session=session, role_id=role_id, data=data)
    return result


@router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_role(
    role_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:role")),
):
    await get_role_repository.delete_role(session=session, role_id=role_id, force=force)


@router.post(
    "/assign_permission",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_permission(
    data: RolePermissionAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:role")),
):
    await get_role_repository.assign_permissions(session=session, data=data)
    return {"message": "Permissions assigned successfully"}
