from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_curriculum_repository
from .schemas import (
    CurriculumCreateRequest,
    CurriculumListRequest,
    CurriculumListResponse,
    CurriculumReorderRequest,
    CurriculumResponse,
    CurriculumUpdateRequest,
)

router = APIRouter(
    tags=["Curriculum"],
    prefix="/curriculum",
)


@router.post(
    "/",
    response_model=CurriculumResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def create_curriculum_row(
    data: CurriculumCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:curriculum")),
):
    return await get_curriculum_repository.create_row(session=session, data=data)


@router.get("/", response_model=CurriculumListResponse)
async def list_curriculum(
    data: CurriculumListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:curriculum")),
):
    return await get_curriculum_repository.list_rows(session=session, request=data)


@router.put(
    "/reorder",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def reorder_curriculum(
    data: CurriculumReorderRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:curriculum")),
):
    await get_curriculum_repository.reorder(session=session, ids=data.ids)
    return {"message": "Reordered"}


@router.delete(
    "/",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def clear_curriculum(
    speciality_id: int,
    semester: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:curriculum")),
):
    deleted = await get_curriculum_repository.clear(
        session=session, speciality_id=speciality_id, semester=semester
    )
    return {"deleted": deleted}


@router.get("/{row_id}", response_model=CurriculumResponse)
async def get_curriculum_row(
    row_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:curriculum")),
):
    return await get_curriculum_repository.get_row(session=session, row_id=row_id)


@router.put(
    "/{row_id}",
    response_model=CurriculumResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def update_curriculum_row(
    row_id: int,
    data: CurriculumUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:curriculum")),
):
    return await get_curriculum_repository.update_row(session=session, row_id=row_id, data=data)


@router.delete(
    "/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def delete_curriculum_row(
    row_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:curriculum")),
):
    await get_curriculum_repository.delete_row(session=session, row_id=row_id)
