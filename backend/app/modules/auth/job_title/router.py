from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_job_title_repository
from .schemas import (
    JobTitleCreateRequest,
    JobTitleListRequest,
    JobTitleListResponse,
    JobTitleResponse,
    JobTitleUpdateRequest,
)

router = APIRouter(
    tags=["JobTitle"],
    prefix="/job-title",
)


@router.post(
    "/",
    response_model=JobTitleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_job_title(
    data: JobTitleCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:job_title")),
):
    return await get_job_title_repository.create_job_title(session=session, data=data)


@router.get("/{job_title_id}", response_model=JobTitleResponse)
async def get_job_title(
    job_title_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:job_title")),
):
    return await get_job_title_repository.get_job_title(session=session, job_title_id=job_title_id)


@router.get("/", response_model=JobTitleListResponse)
async def list_job_titles(
    data: JobTitleListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:job_title")),
):
    return await get_job_title_repository.list_job_titles(session=session, request=data)


@router.put(
    "/{job_title_id}",
    response_model=JobTitleResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_job_title(
    job_title_id: int,
    data: JobTitleUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:job_title")),
):
    return await get_job_title_repository.update_job_title(
        session=session, job_title_id=job_title_id, data=data
    )


@router.delete(
    "/{job_title_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_job_title(
    job_title_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:job_title")),
):
    await get_job_title_repository.delete_job_title(session=session, job_title_id=job_title_id)
