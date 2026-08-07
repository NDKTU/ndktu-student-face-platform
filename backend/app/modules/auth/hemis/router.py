from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    HemisLoginRequest,
    HemisLoginResponse,
    HemisPreviewResponse,
    HemisSyncResponse,
)
from .service import hemis_service

router = APIRouter(prefix="/hemis", tags=["Hemis"])


@router.post(
    "/login",
    response_model=HemisLoginResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def hemis_login(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.hemis_login(session=session, data=data)


@router.post(
    "/preview",
    response_model=HemisPreviewResponse,
    dependencies=[Depends(PermissionRequired("hemis_admin_preview"))],
)
async def preview_hemis_data(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.preview_hemis_data(session=session, data=data)


@router.post(
    "/sync",
    response_model=HemisSyncResponse,
    dependencies=[Depends(PermissionRequired("hemis_admin_sync"))],
)
async def sync_hemis_data(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.sync_hemis_data(session=session, data=data)
