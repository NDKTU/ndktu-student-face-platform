from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_speciality_repository
from .schemas import (
    SpecialityCreateRequest,
    SpecialityListRequest,
    SpecialityListResponse,
    SpecialityResponse,
    SpecialityUpdateRequest,
)

router = APIRouter(
    tags=["Speciality"],
    prefix="/speciality",
)


@router.post(
    "/",
    response_model=SpecialityResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_speciality(
    data: SpecialityCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:speciality")),
):
    return await get_speciality_repository.create_speciality(session=session, data=data)


@router.get("/", response_model=SpecialityListResponse)
async def list_specialities(
    data: SpecialityListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:speciality")),
):
    return await get_speciality_repository.list_specialities(session=session, request=data)


@router.get("/{speciality_id}", response_model=SpecialityResponse)
async def get_speciality(
    speciality_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:speciality")),
):
    return await get_speciality_repository.get_speciality(session=session, speciality_id=speciality_id)


@router.put(
    "/{speciality_id}",
    response_model=SpecialityResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_speciality(
    speciality_id: int,
    data: SpecialityUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:speciality")),
):
    return await get_speciality_repository.update_speciality(
        session=session, speciality_id=speciality_id, data=data
    )


@router.delete(
    "/{speciality_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_speciality(
    speciality_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:speciality")),
):
    await get_speciality_repository.delete_speciality(session=session, speciality_id=speciality_id)
