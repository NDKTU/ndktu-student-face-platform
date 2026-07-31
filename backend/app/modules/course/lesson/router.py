from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_lesson_repository
from .schemas import (
    LessonCreateRequest,
    LessonListRequest,
    LessonListResponse,
    LessonResponse,
    LessonResultListResponse,
    LessonResultsBulkUpsertRequest,
    LessonUpdateRequest,
)

if TYPE_CHECKING:
    from app.modules.auth.model import User


router = APIRouter(
    tags=["Lesson"],
    prefix="/lesson",
)


@router.post(
    "/",
    response_model=LessonResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_lesson(
    data: LessonCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:lesson")),
):
    return await get_lesson_repository.create_lesson(session=session, data=data, current_user=current_user)


@router.get("/", response_model=LessonListResponse)
async def list_lessons(
    data: LessonListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    return await get_lesson_repository.list_lessons(session=session, request=data, current_user=current_user)


@router.get("/{lesson_id}", response_model=LessonResponse)
async def get_lesson(
    lesson_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:lesson")),
):
    return await get_lesson_repository.get_lesson(session=session, lesson_id=lesson_id)


@router.put(
    "/{lesson_id}",
    response_model=LessonResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_lesson(
    lesson_id: int,
    data: LessonUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:lesson")),
):
    return await get_lesson_repository.update_lesson(
        session=session, lesson_id=lesson_id, data=data, current_user=current_user
    )


@router.delete(
    "/{lesson_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_lesson(
    lesson_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:lesson")),
):
    await get_lesson_repository.delete_lesson(session=session, lesson_id=lesson_id, current_user=current_user)


@router.get(
    "/{lesson_id}/results",
    response_model=LessonResultListResponse,
)
async def list_lesson_results(
    lesson_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:lesson")),
):
    return await get_lesson_repository.list_lesson_results(
        session=session, lesson_id=lesson_id, current_user=current_user
    )


@router.put(
    "/{lesson_id}/results",
    response_model=LessonResultListResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def upsert_lesson_results(
    lesson_id: int,
    data: LessonResultsBulkUpsertRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:lesson_result")),
):
    return await get_lesson_repository.upsert_lesson_results(
        session=session,
        lesson_id=lesson_id,
        data=data,
        current_user=current_user,
    )
