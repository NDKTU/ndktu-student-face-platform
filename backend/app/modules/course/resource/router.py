from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_resource_repository
from .schemas import (
    ResourceCreateRequest,
    ResourceListRequest,
    ResourceListResponse,
    ResourceResponse,
    ResourceUpdateRequest,
)

if TYPE_CHECKING:
    from app.modules.auth.model import User


router = APIRouter(
    tags=["Resource"],
    prefix="/resource",
)


@router.post(
    "/",
    response_model=ResourceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_resource(
    data: ResourceCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:resource")),
):
    return await get_resource_repository.create_resource(session=session, data=data, current_user=current_user)


@router.get("/", response_model=ResourceListResponse)
async def list_resources(
    data: ResourceListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:resource")),
):
    return await get_resource_repository.list_resources(session=session, request=data)


@router.post(
    "/upload",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def upload_resource_file(
    file: UploadFile = File(...),
    _: "User" = Depends(PermissionRequired("create:resource")),
):
    url = await get_resource_repository.upload_file(file=file)
    return {"url": url}


@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:resource")),
):
    return await get_resource_repository.get_resource(session=session, resource_id=resource_id)


@router.put(
    "/{resource_id}",
    response_model=ResourceResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def update_resource(
    resource_id: int,
    data: ResourceUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:resource")),
):
    return await get_resource_repository.update_resource(
        session=session, resource_id=resource_id, data=data, current_user=current_user
    )


@router.delete(
    "/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def delete_resource(
    resource_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:resource")),
):
    await get_resource_repository.delete_resource(session=session, resource_id=resource_id, current_user=current_user)
