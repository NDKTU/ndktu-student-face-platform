from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_department_repository
from .schemas import (
    DepartmentCreateRequest,
    DepartmentListRequest,
    DepartmentListResponse,
    DepartmentResponse,
    DepartmentUpdateRequest,
)

router = APIRouter(
    tags=["Department"],
    prefix="/department",
)


@router.post(
    "/",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_department(
    data: DepartmentCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:department")),
):
    return await get_department_repository.create_department(session=session, data=data)


@router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:department")),
):
    return await get_department_repository.get_department(session=session, department_id=department_id)


@router.get("/", response_model=DepartmentListResponse)
async def list_departments(
    data: DepartmentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:department")),
):
    return await get_department_repository.list_departments(session=session, request=data)


@router.put(
    "/{department_id}",
    response_model=DepartmentResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_department(
    department_id: int,
    data: DepartmentUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:department")),
):
    return await get_department_repository.update_department(
        session=session, department_id=department_id, data=data
    )


@router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_department(
    department_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:department")),
):
    await get_department_repository.delete_department(session=session, department_id=department_id)
