from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_employee_repository
from .schemas import (
    EmployeeCreateRequest,
    EmployeeListRequest,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdateRequest,
)

if TYPE_CHECKING:
    from app.modules.user.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Employee"],
    prefix="/employee",
)


@router.post(
    "/",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_employee(
    data: EmployeeCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:employee")),
):
    return await get_employee_repository.create_employee(session=session, data=data)


@router.get("/me", response_model=EmployeeResponse)
async def get_my_employee_profile(
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("employee:me")),
):
    return await get_employee_repository.get_employee_by_user_id(session=session, user_id=current_user.id)


@router.put("/me", response_model=EmployeeResponse)
async def update_my_employee_profile(
    data: EmployeeUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("employee:me")),
):
    employee = await get_employee_repository.get_employee_by_user_id(session=session, user_id=current_user.id)
    return await get_employee_repository.update_employee(session=session, employee_id=employee.id, data=data)


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:employee")),
):
    return await get_employee_repository.get_employee(session=session, employee_id=employee_id)


@router.get("/", response_model=EmployeeListResponse)
async def list_employees(
    data: EmployeeListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:employee")),
):
    return await get_employee_repository.list_employees(session=session, request=data)


@router.put(
    "/{employee_id}",
    response_model=EmployeeResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_employee(
    employee_id: int,
    data: EmployeeUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:employee")),
):
    return await get_employee_repository.update_employee(session=session, employee_id=employee_id, data=data)


@router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_employee(
    employee_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:employee")),
):
    await get_employee_repository.delete_employee(session=session, employee_id=employee_id, force=force)
