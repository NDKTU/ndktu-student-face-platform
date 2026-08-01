from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.roles import is_admin as user_is_admin
from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_course_repository
from .schemas import (
    CourseCreateRequest,
    CourseListRequest,
    CourseListResponse,
    CourseResponse,
    CourseUpdateRequest,
)

if TYPE_CHECKING:
    from app.modules.auth.model import User


def _is_admin(user: "User") -> bool:
    return user_is_admin(user)


router = APIRouter(
    tags=["Course"],
    prefix="/course",
)


@router.post(
    "/",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_course(
    data: CourseCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("create:course")),
):
    return await get_course_repository.create_course(session=session, data=data)


@router.get("/", response_model=CourseListResponse)
async def list_courses(
    data: CourseListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:course")),
):
    restrict = not _is_admin(current_user)
    return await get_course_repository.list_courses(
        session=session,
        request=data,
        current_user=current_user,
        restrict_to_teacher=restrict,
    )


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:course")),
):
    return await get_course_repository.get_course(session=session, course_id=course_id)


@router.put(
    "/{course_id}",
    response_model=CourseResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_course(
    course_id: int,
    data: CourseUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:course")),
):
    return await get_course_repository.update_course(session=session, course_id=course_id, data=data)


@router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_course(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("delete:course")),
):
    await get_course_repository.delete_course(session=session, course_id=course_id)
