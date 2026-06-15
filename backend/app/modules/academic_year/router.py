from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_academic_year_repository
from .schemas import (
    AcademicYearCreateRequest,
    AcademicYearListRequest,
    AcademicYearListResponse,
    AcademicYearResponse,
    AcademicYearUpdateRequest,
    SemesterUpdateRequest,
    SemesterResponse
)

if TYPE_CHECKING:
    from app.modules.user.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["AcademicYear"],
    prefix="/academic-year",
)


@router.post(
    "/",
    response_model=AcademicYearResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_year(
    data: AcademicYearCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("create:academic_year")),
):
    return await get_academic_year_repository.create_year(session=session, data=data)


@router.get("/", response_model=AcademicYearListResponse)
async def list_years(
    data: AcademicYearListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:academic_year")),
):
    return await get_academic_year_repository.list_years(session=session, request=data)


@router.get("/{year_id}", response_model=AcademicYearResponse)
async def get_year(
    year_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:academic_year")),
):
    return await get_academic_year_repository.get_year(session=session, year_id=year_id)


@router.put(
    "/{year_id}",
    response_model=AcademicYearResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_year(
    year_id: int,
    data: AcademicYearUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:academic_year")),
):
    return await get_academic_year_repository.update_year(session=session, year_id=year_id, data=data)


@router.delete(
    "/{year_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_year(
    year_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("delete:academic_year")),
):
    await get_academic_year_repository.delete_year(session=session, year_id=year_id)


@router.put(
    "/semester/{semester_id}",
    response_model=SemesterResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_semester(
    semester_id: int,
    data: SemesterUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:academic_year")),
):
    return await get_academic_year_repository.update_semester(session=session, semester_id=semester_id, data=data)
