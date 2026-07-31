from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_faculty_repository
from .schemas import (
    FacultyCreateRequest,
    FacultyCreateResponse,
    FacultyListRequest,
    FacultyListResponse,
    FacultyUpdateRequest,
)

router = APIRouter(
    tags=["Faculty"],
    prefix="/faculty",
)


@router.post(
    "/",
    response_model=FacultyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_faculty(
    data: FacultyCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:faculty")),
):
    result = await get_faculty_repository.create_faculty(session=session, data=data)
    return result


@router.get("/{faculty_id}", response_model=FacultyCreateResponse)
async def get_faculty(
    faculty_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:faculty")),
):
    return await get_faculty_repository.get_faculty(session=session, faculty_id=faculty_id)


@router.get("/", response_model=FacultyListResponse)
async def list_faculties(
    data: FacultyListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:faculty")),
):
    return await get_faculty_repository.list_faculties(session=session, request=data)


@router.put(
    "/{faculty_id}",
    response_model=FacultyCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_faculty(
    faculty_id: int,
    data: FacultyUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:faculty")),
):
    result = await get_faculty_repository.update_faculty(session=session, faculty_id=faculty_id, data=data)
    return result


@router.delete(
    "/{faculty_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_faculty(
    faculty_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:faculty")),
):
    await get_faculty_repository.delete_faculty(session=session, faculty_id=faculty_id, force=force)
