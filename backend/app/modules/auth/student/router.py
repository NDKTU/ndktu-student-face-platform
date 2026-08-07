from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import student_repository
from .schemas import (
    StudentListRequest,
    StudentListResponse,
    StudentResponse,
    StudentSensitiveResponse,
    StudentUpdateRequest,
    StudentWithUserListResponse,
)

router = APIRouter(prefix="/students", tags=["Students"])


@router.get("/with-users", response_model=StudentWithUserListResponse)
async def list_students_with_users(
    data: StudentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    return await student_repository.list_students_with_users(session=session, request=data)


@router.get("/", response_model=StudentListResponse)
async def list_students(
    data: StudentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    return await student_repository.list_students(session=session, request=data)


@router.get("/{student_id}/sensitive", response_model=StudentSensitiveResponse)
async def get_student_sensitive(
    student_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student_sensitive")),
):
    return await student_repository.get_student(session, student_id)


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    return await student_repository.get_student(session, student_id)


@router.put(
    "/{student_id}",
    response_model=StudentResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_student(
    student_id: int,
    data: StudentUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:student")),
):
    result = await student_repository.update_student(session, student_id, data)
    return result


@router.delete(
    "/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_student(
    student_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:student")),
):
    await student_repository.delete_student(session, student_id, force)
